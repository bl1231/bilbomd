import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import { handleBilboMDSANSJob } from '../handleBilboMDSANSJob.js'
import { queueJob } from '../../../queues/bilbomd.js'

// Mocks
vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../../../queues/bilbomd.js', () => ({
  queueJob: vi.fn(async () => 'bull-id-123')
}))

vi.mock('../../config/config.js', () => ({
  config: { uploadDir: '/tmp/uploads' }
}))

// Mock fs-extra to avoid filesystem operations failing in tests
vi.mock('fs-extra', () => ({
  copyFile: vi.fn(async () => {}),
  default: {
    copyFile: vi.fn(async () => {})
  }
}))

vi.mock('../index.js', () => ({
  sanitizeConstInpFile: vi.fn(async () => {}),
  writeJobParams: vi.fn(async () => {})
}))

// Mock param builders
vi.mock('../utils/openmmParams.js', () => ({
  buildOpenMMParameters: vi.fn((params: unknown) => ({
    engine: 'OpenMM',
    ...(params as object)
  }))
}))

vi.mock('../utils/charmmParams.js', () => ({
  buildCHARMMParameters: vi.fn((params: unknown) => ({
    engine: 'CHARMM',
    ...(params as object)
  }))
}))

// Mock Mongo model from package
vi.mock('@bilbomd/mongodb-schema', () => {
  class BilboMdSANSJobMock {
    public id = 'mongo-id-1'
    public _id = 'mongo-id-1'
    public uuid!: string
    public title!: string
    public md_engine!: 'CHARMM' | 'OpenMM'
    public openmm_parameters?: unknown
    public charmm_parameters?: unknown
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data)
    }
    async save() {
      return this
    }
  }
  return {
    BilboMdSANSJob: BilboMdSANSJobMock,
    StepStatus: { Waiting: 'Waiting' }
  }
})

const makeReqRes = (
  bodyOverrides: Partial<Record<string, unknown>> = {},
  filesOverrides: unknown = {}
) => {
  const req = {
    body: {
      title: 'SANS job',
      bilbomd_mode: 'sans',
      md_engine: 'openmm',
      d2o_fraction: 0.7,
      rg: 30,
      rg_min: 20,
      rg_max: 40,
      ...bodyOverrides,
      // Add a deuteration fraction example
      deuteration_fraction_A: '0.5'
    },
    files: {
      pdb_file: [{ originalname: 'protein.pdb' }],
      dat_file: [{ originalname: 'curve.dat' }],
      inp_file: [{ originalname: 'const.inp' }],
      ...(filesOverrides as object)
    },
    get: vi.fn((name: string) =>
      name === 'origin' ? 'http://localhost:3002' : undefined
    ),
    protocol: 'http'
  } as unknown as Request

  const json = vi.fn()
  const status = vi.fn(() => ({ json })) as unknown as Response['status']
  const res = { status, json } as unknown as Response

  return { req, res }
}

const user = { _id: 'user-1', username: 'user1', email: 'u@example.com' } as {
  _id: string
  username: string
  email: string
}
const UUID = 'uuid-123'

describe('handleBilboMDSANSJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('populates OpenMM parameters and md_engine in response', async () => {
    const { req, res } = makeReqRes({ md_engine: 'openmm' })

    await handleBilboMDSANSJob(req, res, user, UUID, { accessMode: 'user' })

    // Response
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = (res.json as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { md_engine: 'OpenMM' | 'CHARMM' }
    expect(payload.md_engine).toBe('OpenMM')

    // Model instance was constructed with openmm_parameters
    // We can check via the mocked buildOpenMMParameters being called
    const { buildOpenMMParameters } = await import('../utils/openmmParams.js')
    expect(buildOpenMMParameters).toHaveBeenCalled()
  })

  it('populates CHARMM parameters when md_engine is charmm', async () => {
    const { req, res } = makeReqRes({ md_engine: 'charmm' })

    await handleBilboMDSANSJob(req, res, user, UUID, { accessMode: 'user' })

    expect(res.status).toHaveBeenCalledWith(200)
    const payload = (res.json as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { md_engine: 'OpenMM' | 'CHARMM' }
    expect(payload.md_engine).toBe('CHARMM')

    const { buildCHARMMParameters } = await import('../utils/charmmParams.js')
    expect(buildCHARMMParameters).toHaveBeenCalled()
  })

  it('includes md_engine in queued job data', async () => {
    const { req, res } = makeReqRes({ md_engine: 'openmm' })

    await handleBilboMDSANSJob(req, res, user, UUID, { accessMode: 'user' })

    expect(queueJob).toHaveBeenCalled()
    const arg = (queueJob as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as { md_engine: string }
    expect(arg.md_engine).toBe('OpenMM')
  })
})
