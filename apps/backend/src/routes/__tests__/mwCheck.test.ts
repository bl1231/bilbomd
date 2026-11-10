import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const dataVol = fs.mkdtempSync(path.join(os.tmpdir(), 'mwcheck-test-'))
process.env.DATA_VOL = dataVol

const { runMwCheck } = vi.hoisted(() => ({ runMwCheck: vi.fn() }))

vi.mock('../../services/mwCheck/runMwCheck.js', () => ({ runMwCheck }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const { default: mwCheckRoutes } = await import('../mwCheck.js')

const app = express()
app.use('/mw-check', mwCheckRoutes)

// A SAXS profile in 1/Å with enough points to pass the data checks
const SAXS = Array.from({ length: 200 }, (_, i) => {
  const q = 0.01 + i * 0.002
  const intensity = 100 * Math.exp(-((q * 20) ** 2) / 3) + 0.1
  return `${q.toFixed(4)} ${intensity.toFixed(5)} ${(intensity * 0.02).toFixed(5)}`
}).join('\n')
const PDB = 'ATOM      1  CA  ALA A   1       0.000   0.000   0.000\n'

const result = {
  mw: { model_kda: 28.9, saxs_kda: 29.1, diff_fraction: 0.007 },
  finding: { code: 'mw_consistent', severity: 'good', title: 't', detail: 'd' }
}

const uploadDir = path.join(dataVol, 'mwcheck_uploads')
const leftovers = async () =>
  (await fs.pathExists(uploadDir)) ? fs.readdir(uploadDir) : []

// What the script would have found in its working directory
let seen: { files: string[]; entities?: unknown; saxsHead?: string }

beforeEach(() => {
  vi.clearAllMocks()
  seen = { files: [] }
  runMwCheck.mockImplementation(async (dir: string) => {
    seen.files = (await fs.readdir(dir)).sort()
    if (seen.files.includes('entities.json')) {
      seen.entities = await fs.readJson(path.join(dir, 'entities.json'))
    }
    seen.saxsHead = (
      await fs.readFile(path.join(dir, 'expdata.dat'), 'utf8')
    ).slice(0, 6)
    return result
  })
})

afterAll(async () => {
  await fs.remove(dataVol)
})

describe('POST /mw-check', () => {
  it('checks an uploaded PDB against the SAXS data', async () => {
    const res = await request(app)
      .post('/mw-check')
      .field('q_units', 'auto')
      .attach('dat_file', Buffer.from(SAXS), '../../evil name.dat')
      .attach('pdb_file', Buffer.from(PDB), 'My Model.PDB')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(result)
    // Saved under names the server chose, whatever the client called them
    expect(seen.files).toEqual(['expdata.dat', 'model.pdb'])
    expect(runMwCheck).toHaveBeenCalledWith(
      expect.stringContaining(uploadDir),
      'expdata.dat',
      { kind: 'pdb', file: 'model.pdb' }
    )
    expect(await leftovers()).toEqual([])
  })

  it('checks a PSF', async () => {
    const res = await request(app)
      .post('/mw-check')
      .attach('dat_file', Buffer.from(SAXS), 'saxs.dat')
      .attach('psf_file', Buffer.from('PSF\n'), 'model.psf')

    expect(res.status).toBe(200)
    expect(runMwCheck).toHaveBeenCalledWith(expect.any(String), 'expdata.dat', {
      kind: 'psf',
      file: 'model.psf'
    })
  })

  it('checks sequences, passing on only the validated fields', async () => {
    const res = await request(app)
      .post('/mw-check')
      .attach('dat_file', Buffer.from(SAXS), 'saxs.dat')
      .field(
        'entities',
        JSON.stringify([
          {
            id: '1',
            name: 'pro-1',
            type: 'Protein',
            sequence: 'mk t',
            copies: 2
          }
        ])
      )

    expect(res.status).toBe(200)
    expect(seen.entities).toEqual([
      { type: 'Protein', sequence: 'MKT', copies: 2 }
    ])
    expect(runMwCheck).toHaveBeenCalledWith(expect.any(String), 'expdata.dat', {
      kind: 'entities',
      file: 'entities.json'
    })
  })

  it('converts the data to 1/Å before the check, as a submission would', async () => {
    const nm = Array.from({ length: 200 }, (_, i) => {
      const q = 0.1 + i * 0.02
      return `${q.toFixed(4)} ${(100 / (1 + q)).toFixed(5)} 0.5`
    }).join('\n')
    const res = await request(app)
      .post('/mw-check')
      .field('q_units', 'nm')
      .attach('dat_file', Buffer.from(nm), 'saxs.dat')
      .attach('pdb_file', Buffer.from(PDB), 'model.pdb')

    expect(res.status).toBe(200)
    // The first q, 0.1 nm⁻¹, is 0.01 Å⁻¹ by the time the script reads it
    expect(seen.saxsHead).not.toBe('0.1000')
    expect(seen.files).toContain('expdata.dat.orig')
  })

  it.each([
    [
      'no SAXS file',
      (r: request.Test) => r.attach('pdb_file', Buffer.from(PDB), 'm.pdb'),
      /SAXS data file is required/
    ],
    [
      'no model',
      (r: request.Test) => r.attach('dat_file', Buffer.from(SAXS), 's.dat'),
      /exactly one/
    ],
    [
      'two models',
      (r: request.Test) =>
        r
          .attach('dat_file', Buffer.from(SAXS), 's.dat')
          .attach('pdb_file', Buffer.from(PDB), 'm.pdb')
          .field('entities', '[{"type":"Protein","sequence":"MKT"}]'),
      /exactly one/
    ],
    [
      'bad q_units',
      (r: request.Test) =>
        r
          .field('q_units', 'furlongs')
          .attach('dat_file', Buffer.from(SAXS), 's.dat')
          .attach('pdb_file', Buffer.from(PDB), 'm.pdb'),
      /q_units must be one of/
    ],
    [
      'bad sequences',
      (r: request.Test) =>
        r
          .attach('dat_file', Buffer.from(SAXS), 's.dat')
          .field('entities', '[{"type":"Protein","sequence":"MK;rm"}]'),
      /only contain letters/
    ],
    [
      'unusable SAXS data',
      (r: request.Test) =>
        r
          .field('q_units', 'auto')
          .attach('dat_file', Buffer.from('not saxs data\n'), 's.dat')
          .attach('pdb_file', Buffer.from(PDB), 'm.pdb'),
      /./
    ]
  ])('rejects a request with %s', async (_name, build, expected) => {
    const res = await build(request(app).post('/mw-check'))

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(expected)
    expect(runMwCheck).not.toHaveBeenCalled()
    expect(await leftovers()).toEqual([])
  })

  it('rejects an oversized SAXS file', async () => {
    const res = await request(app)
      .post('/mw-check')
      .attach('dat_file', Buffer.alloc(2_000_001, '1'), 's.dat')
      .attach('pdb_file', Buffer.from(PDB), 'm.pdb')

    expect(res.status).toBe(413)
    expect(runMwCheck).not.toHaveBeenCalled()
    expect(await leftovers()).toEqual([])
  })

  it('ignores files sent under other field names', async () => {
    const res = await request(app)
      .post('/mw-check')
      .attach('dat_file', Buffer.from(SAXS), 's.dat')
      .attach('pdb_file', Buffer.from(PDB), 'm.pdb')
      .attach('script', Buffer.from('#!/bin/sh\n'), 'run.sh')

    expect(res.status).toBe(400)
    expect(runMwCheck).not.toHaveBeenCalled()
    expect(await leftovers()).toEqual([])
  })

  it('answers 500 and cleans up when the script fails', async () => {
    runMwCheck.mockRejectedValue(new Error('python exploded'))
    const res = await request(app)
      .post('/mw-check')
      .attach('dat_file', Buffer.from(SAXS), 's.dat')
      .attach('pdb_file', Buffer.from(PDB), 'm.pdb')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ message: 'Failed to run the mass check.' })
    expect(await leftovers()).toEqual([])
  })
})
