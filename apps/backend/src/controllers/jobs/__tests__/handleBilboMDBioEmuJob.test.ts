import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'

const { saved, queueJob, createBioEmuSystemYaml, spawnAutoRgCalculator } =
  vi.hoisted(() => ({
    saved: [] as Record<string, unknown>[],
    queueJob: vi.fn(async () => 'bull-1'),
    createBioEmuSystemYaml: vi.fn(async () => 'bioemu/system.yaml'),
    spawnAutoRgCalculator: vi.fn(async () => ({
      rg: 33,
      rg_min: 30,
      rg_max: 49
    }))
  }))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../../config/config.js', () => ({
  config: { uploadDir: '/tmp/uploads' }
}))
vi.mock('../../../services/announceNewJob.js', () => ({
  announceNewJob: vi.fn()
}))
vi.mock('../../../queues/bilbomd.js', () => ({ queueJob }))
vi.mock('../index.js', () => ({
  writeJobParams: vi.fn(),
  spawnAutoRgCalculator
}))
vi.mock('../utils/createBioEmuSystemYaml.js', () => ({
  createBioEmuSystemYaml
}))
vi.mock('../utils/saxsData.js', () => ({
  prepareSaxsDataFile: vi.fn(async () => ({ ok: true, warnings: [] })),
  saxsDataError: (message: string) => ({ message })
}))
vi.mock('../utils/serverFiles.js', () => ({ serverFile: vi.fn() }))
vi.mock('../../../validation/index.js', () => ({
  bioemuJobSchema: { validate: vi.fn(async () => {}) }
}))
vi.mock('@bilbomd/mongodb-schema', () => {
  class BilboMdBioEmuJobMock {
    static schema = { path: () => undefined }
    public _id = { toString: () => 'mongo-bioemu-1' }
    public uuid = 'uuid-123'
    public title!: string
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data)
    }
    async save() {
      saved.push({ ...(this as unknown as Record<string, unknown>) })
      return this
    }
  }
  return {
    BilboMdBioEmuJob: BilboMdBioEmuJobMock,
    StepStatus: { Waiting: 'Waiting', Success: 'Success' }
  }
})

const { handleBilboMDBioEmuJob, bioemuAccessError, defaultBioEmuParameters } =
  await import('../handleBilboMDBioEmuJob.js')

const admin = { _id: 'u1', roles: ['User', 'Admin'] } as unknown as IUser
const plainUser = { _id: 'u2', roles: ['User'] } as unknown as IUser

const makeReqRes = () => {
  const req = {
    body: {
      title: 'BioEmu2 job',
      bilbomd_mode: 'bioemu',
      entities_json: JSON.stringify([
        { name: 'pp1', sequence: 'ACDEFGHIK', type: 'Protein', copies: 2 }
      ])
    },
    files: { dat_file: [{ originalname: 'SAXS.dat' }] }
  } as unknown as Request
  const json = vi.fn()
  const status = vi.fn(() => ({ json })) as unknown as Response['status']
  return { req, res: { status, json } as unknown as Response, json }
}

beforeEach(() => {
  vi.clearAllMocks()
  saved.length = 0
  process.env.ENABLE_BILBOMD_BIOEMU = 'true'
})

afterEach(() => {
  delete process.env.ENABLE_BILBOMD_BIOEMU
})

describe('bioemuAccessError', () => {
  it('lets an Admin through when the pipeline is enabled', () => {
    expect(bioemuAccessError(admin, 'user')).toBeNull()
  })

  it('refuses everyone while the pipeline is disabled', () => {
    delete process.env.ENABLE_BILBOMD_BIOEMU
    expect(bioemuAccessError(admin, 'user')?.message).toMatch(/not enabled/)
  })

  it('refuses non-admins and anonymous submissions', () => {
    expect(bioemuAccessError(plainUser, 'user')?.status).toBe(403)
    expect(bioemuAccessError(undefined, 'anonymous')?.message).toMatch(
      /administrators only/
    )
  })
})

describe('defaultBioEmuParameters', () => {
  it('is the Phase 0 steer config', () => {
    expect(defaultBioEmuParameters([30, 34])).toEqual({
      rgs: [30, 34],
      num_samples_per_rg: 50,
      batch_size: 40,
      num_steps: 50,
      num_gd_steps: 5,
      rg_weight: 0.02,
      default_potentials: true
    })
  })
})

describe('handleBilboMDBioEmuJob', () => {
  it('rejects a non-admin before touching the job', async () => {
    const { req, res } = makeReqRes()
    await handleBilboMDBioEmuJob(req, res, plainUser, 'uuid-123', {
      accessMode: 'user'
    })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(createBioEmuSystemYaml).not.toHaveBeenCalled()
    expect(queueJob).not.toHaveBeenCalled()
  })

  it('saves and queues an admin job with the Rg targets from AutoRg', async () => {
    const { req, res, json } = makeReqRes()

    await handleBilboMDBioEmuJob(req, res, admin, 'uuid-123', {
      accessMode: 'user'
    })

    expect(res.status).toHaveBeenCalledWith(200)
    expect(json.mock.calls[0][0]).toMatchObject({
      jobid: 'mongo-bioemu-1',
      uuid: 'uuid-123',
      md_engine: 'OpenMM'
    })
    expect(createBioEmuSystemYaml).toHaveBeenCalledWith(
      [{ name: 'pp1', sequence: 'ACDEFGHIK', type: 'Protein', copies: 2 }],
      '/tmp/uploads/uuid-123'
    )
    const job = saved[0]
    expect(job.data_file).toBe('saxs.dat')
    expect(job.system_yaml_file).toBe('bioemu/system.yaml')
    // calculateRgyrRange(30, 49): six evenly spaced targets
    expect((job.bioemu_parameters as { rgs: number[] }).rgs).toEqual([
      30, 34, 38, 41, 45, 49
    ])
    expect(Object.keys(job.steps as object)).toEqual([
      'autorg',
      'bioemu',
      'foxs',
      'multifoxs',
      'polish',
      'results',
      'email'
    ])
    expect(queueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bioemu', jobid: 'mongo-bioemu-1' })
    )
  })

  it('rejects out-of-bounds AutoRg results', async () => {
    spawnAutoRgCalculator.mockResolvedValueOnce({
      rg: 120,
      rg_min: 100,
      rg_max: 140
    })
    const { req, res } = makeReqRes()
    await handleBilboMDBioEmuJob(req, res, admin, 'uuid-123', {
      accessMode: 'user'
    })
    expect(res.status).toHaveBeenCalledWith(400)
    expect(queueJob).not.toHaveBeenCalled()
  })
})
