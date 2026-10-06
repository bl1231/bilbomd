import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Express } from 'express'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { SAXS_NORMALIZED_MARKER } from '@bilbomd/bilbomd-types'

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { prepareSaxsDataFile, saxsDataError } from '../saxsData.js'

// Guinier-like curve for a 30 Å particle; qScale 10 writes it in nm⁻¹
const buildCurve = (qEnd = 0.4, qScale = 1): string => {
  const lines: string[] = []
  for (let q = 0.01; q <= qEnd + 1e-9; q += 0.002) {
    const intensity = 1000 * Math.exp(-(q * q * 900) / 3) + 1
    lines.push(
      `${(q * qScale).toFixed(4)} ${intensity.toFixed(4)} ${(intensity * 0.02).toFixed(4)}`
    )
  }
  return lines.join('\n') + '\n'
}

let dir: string

const writeDat = async (content: string): Promise<Express.Multer.File> => {
  const filePath = path.join(dir, 'saxs.dat')
  await fs.writeFile(filePath, content)
  return {
    originalname: 'saxs.dat',
    path: filePath,
    size: Buffer.byteLength(content)
  } as Express.Multer.File
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saxs-data-test-'))
})

afterEach(async () => {
  await fs.remove(dir)
})

describe('prepareSaxsDataFile', () => {
  it('leaves a clean Å⁻¹ file untouched', async () => {
    const content = buildCurve()
    const file = await writeDat(content)
    const result = await prepareSaxsDataFile(file, undefined)
    expect(result).toEqual({ ok: true, warnings: [] })
    expect(await fs.readFile(file.path, 'utf8')).toBe(content)
    expect(await fs.pathExists(`${file.path}.orig`)).toBe(false)
  })

  it('converts an nm⁻¹ file in place and keeps the upload as .orig', async () => {
    const content = buildCurve(0.4, 10)
    const file = await writeDat(content)
    const result = await prepareSaxsDataFile(file, 'auto')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings[0]).toMatch(/nm⁻¹/)

    const rewritten = await fs.readFile(file.path, 'utf8')
    expect(rewritten.startsWith(SAXS_NORMALIZED_MARKER)).toBe(true)
    expect(rewritten).toContain('\n0.01 ')
    expect(await fs.readFile(`${file.path}.orig`, 'utf8')).toBe(content)
  })

  it('trims q above 0.45 Å⁻¹', async () => {
    const file = await writeDat(buildCurve(0.6))
    const result = await prepareSaxsDataFile(file, '')
    expect(result.ok).toBe(true)
    const qValues = (await fs.readFile(file.path, 'utf8'))
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => Number(line.split(' ')[0]))
    expect(Math.max(...qValues)).toBeLessThanOrEqual(0.45)
  })

  it('does nothing further to a file it already normalized', async () => {
    const file = await writeDat(buildCurve(0.4, 10))
    await prepareSaxsDataFile(file, 'nm')
    const once = await fs.readFile(file.path, 'utf8')
    // A resubmission reuses the stored file, possibly with the same q_units
    const result = await prepareSaxsDataFile(file, 'nm')
    expect(result).toEqual({ ok: true, warnings: [] })
    expect(await fs.readFile(file.path, 'utf8')).toBe(once)
  })

  it('rejects data it cannot interpret without modifying the file', async () => {
    const content = 'not\nSAXS data\n'
    const file = await writeDat(content)
    const result = await prepareSaxsDataFile(file, 'auto')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/No SAXS data found/)
    expect(await fs.readFile(file.path, 'utf8')).toBe(content)
  })

  it('leaves problems the job schema reports to the schema', async () => {
    const content = buildCurve(0.4, 10)
    const file = await writeDat(content)
    // missing file, oversized file, invalid q_units
    expect(await prepareSaxsDataFile(undefined, 'auto')).toEqual({
      ok: true,
      warnings: []
    })
    expect(
      await prepareSaxsDataFile({ ...file, size: 3_000_000 }, 'auto')
    ).toEqual({ ok: true, warnings: [] })
    expect(await prepareSaxsDataFile(file, 'angstrom')).toEqual({
      ok: true,
      warnings: []
    })
    expect(await fs.readFile(file.path, 'utf8')).toBe(content)
  })

  it('reports an unreadable file', async () => {
    const result = await prepareSaxsDataFile(
      {
        originalname: 'gone.dat',
        path: path.join(dir, 'gone.dat'),
        size: 10
      } as Express.Multer.File,
      'auto'
    )
    expect(result).toEqual({
      ok: false,
      message: 'Error reading SAXS file content'
    })
  })
})

describe('saxsDataError', () => {
  it('matches the schema validation error shape', () => {
    expect(saxsDataError('bad data')).toEqual({
      message: 'Validation failed',
      errors: [{ path: 'dat_file', message: 'bad data' }]
    })
  })
})
