import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import type { Request } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'
import { Job } from '@bilbomd/mongodb-schema'
import { prepareResubmission, isResubmitRequest } from '../resubmission.js'

const { uploadDir } = vi.hoisted(() => ({
  uploadDir: { current: '' }
}))

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../../../config/config.js', () => ({
  config: {
    get uploadDir() {
      return uploadDir.current
    }
  }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findById: vi.fn() }
}))

const ORIGINAL_ID = '64b7f0c2a1b2c3d4e5f60718'
const OWNER_ID = '64b7f0c2a1b2c3d4e5f60001'

const makeUser = (id: string, roles: string[] = ['User']) =>
  ({ _id: { toString: () => id }, roles }) as unknown as IUser

const makeOriginalJob = (fields: Record<string, string>) => ({
  uuid: 'orig-uuid',
  user: { _id: { toString: () => OWNER_ID } },
  get: (key: string) => fields[key]
})

const makeReq = (
  body: Record<string, unknown>,
  files: Record<string, unknown> = {}
) =>
  ({
    body: { resubmit: 'true', original_job_id: ORIGINAL_ID, ...body },
    files
  }) as unknown as Request

describe('prepareResubmission', () => {
  let jobDir: string
  let originalDir: string

  beforeEach(async () => {
    uploadDir.current = await fs.mkdtemp(path.join(os.tmpdir(), 'resubmit-'))
    originalDir = path.join(uploadDir.current, 'orig-uuid')
    jobDir = path.join(uploadDir.current, 'new-uuid')
    await fs.ensureDir(originalDir)
    await fs.ensureDir(jobDir)
    await fs.writeFile(path.join(originalDir, 'model.pdb'), 'ATOM')
    await fs.writeFile(path.join(originalDir, 'saxs.dat'), '0.1 1.0')
    await fs.writeFile(path.join(originalDir, 'const.inp'), 'define')
    vi.mocked(Job.findById).mockResolvedValue(
      makeOriginalJob({
        pdb_file: 'model.pdb',
        data_file: 'saxs.dat',
        const_inp_file: 'const.inp'
      }) as never
    )
  })

  afterEach(async () => {
    await fs.remove(uploadDir.current)
    vi.clearAllMocks()
  })

  it('does nothing for a normal submission', async () => {
    const req = { body: { title: 'x' }, files: {} } as unknown as Request
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)
    expect(result).toEqual({ ok: true })
    expect(Job.findById).not.toHaveBeenCalled()
  })

  it('copies files flagged for reuse and points the body at them', async () => {
    const req = makeReq({
      reuse_pdb_file: 'true',
      reuse_dat_file: 'true',
      reuse_inp_file: 'true'
    })
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(result).toEqual({ ok: true })
    expect(req.body).toMatchObject({
      pdb_file: 'model.pdb',
      dat_file: 'saxs.dat',
      inp_file: 'const.inp'
    })
    expect(await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')).toBe(
      'define'
    )
  })

  it('prefers a newly uploaded file over reusing the original', async () => {
    const req = makeReq(
      { reuse_pdb_file: 'true', reuse_dat_file: 'true' },
      { dat_file: [{ originalname: 'new.dat' }] }
    )
    await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(req.body.dat_file).toBeUndefined()
    expect(await fs.pathExists(path.join(jobDir, 'saxs.dat'))).toBe(false)
    expect(req.body.pdb_file).toBe('model.pdb')
  })

  it('only copies files the form asked to reuse', async () => {
    const req = makeReq({ reuse_pdb_file: 'true' })
    await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(await fs.readdir(jobDir)).toEqual(['model.pdb'])
  })

  it('returns 410 when an original file has been cleaned up', async () => {
    await fs.remove(path.join(originalDir, 'saxs.dat'))
    const req = makeReq({ reuse_dat_file: 'true' })
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(result).toMatchObject({ ok: false, status: 410 })
  })

  it('returns 400 when the original job has no such file', async () => {
    const req = makeReq({ reuse_pae_file: 'true' })
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('never copies from outside the original job directory', async () => {
    vi.mocked(Job.findById).mockResolvedValue(
      makeOriginalJob({ pdb_file: '../elsewhere/model.pdb' }) as never
    )
    const req = makeReq({ reuse_pdb_file: 'true' })
    await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(req.body.pdb_file).toBe('model.pdb')
    expect(await fs.pathExists(path.join(jobDir, 'model.pdb'))).toBe(true)
  })

  it('returns 400 for a malformed original job id', async () => {
    const req = makeReq({ original_job_id: 'nope' })
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('returns 403 without a signed-in user', async () => {
    const req = makeReq({ reuse_pdb_file: 'true' })
    const result = await prepareResubmission(req, undefined, jobDir)

    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('returns 404 when the original job does not exist', async () => {
    vi.mocked(Job.findById).mockResolvedValue(null as never)
    const req = makeReq({ reuse_pdb_file: 'true' })
    const result = await prepareResubmission(req, makeUser(OWNER_ID), jobDir)

    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it("returns 404 for another user's job", async () => {
    const req = makeReq({ reuse_pdb_file: 'true' })
    const result = await prepareResubmission(
      req,
      makeUser('64b7f0c2a1b2c3d4e5f69999'),
      jobDir
    )

    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(await fs.readdir(jobDir)).toEqual([])
  })

  it.each(['Admin', 'Manager'])('lets a %s reuse any job', async (role) => {
    const req = makeReq({ reuse_pdb_file: 'true' })
    const result = await prepareResubmission(
      req,
      makeUser('64b7f0c2a1b2c3d4e5f69999', [role]),
      jobDir
    )

    expect(result).toEqual({ ok: true })
  })
})

describe('isResubmitRequest', () => {
  it.each([
    [true, true],
    ['true', true],
    ['false', false],
    [undefined, false]
  ])('resubmit=%s -> %s', (value, expected) => {
    const req = { body: { resubmit: value } } as unknown as Request
    expect(isResubmitRequest(req)).toBe(expected)
  })
})
