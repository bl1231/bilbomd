import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'
import { handleBilboMDScoperJob } from '../handleBilboMDScoperJob.js'
import { queueScoperJob } from '../../../queues/scoper.js'
import { announceNewJob } from '../../../services/announceNewJob.js'
import { ValidationError } from 'yup'
import { scoperJobSchema } from '../../../validation/index.js'
import { setServerFile } from '../utils/serverFiles.js'
import { prepareSaxsDataFile } from '../utils/saxsData.js'

vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../../../services/announceNewJob.js', () => ({
  announceNewJob: vi.fn()
}))
vi.mock('../../../queues/scoper.js', () => ({
  queueScoperJob: vi.fn(async () => 'bull-scoper-id-1')
}))

vi.mock('../../config/config.js', () => ({
  config: { uploadDir: '/tmp/uploads' }
}))

vi.mock('../utils/jobUtils.js', () => ({
  getFileStats: vi.fn(() => ({ size: 1024 }))
}))

vi.mock('../utils/saxsData.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/saxsData.js')>()),
  prepareSaxsDataFile: vi.fn(async () => ({ ok: true, warnings: [] }))
}))

vi.mock('../../../validation/index.js', () => ({
  scoperJobSchema: {
    validate: vi.fn(async () => {})
  }
}))

vi.mock('@bilbomd/mongodb-schema', () => {
  class BilboMdScoperJobMock {
    public id = 'mongo-scoper-1'
    public _id = { toString: () => 'mongo-scoper-1' }
    public uuid = 'uuid-123'
    public title!: string
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data)
    }
    async save() {
      return this
    }
  }
  return {
    BilboMdScoperJob: BilboMdScoperJobMock,
    StepStatus: { Waiting: 'Waiting' }
  }
})

const makeReqRes = (
  bodyOverrides: Partial<Record<string, unknown>> = {},
  filesOverrides: unknown = {}
) => {
  const req = {
    body: {
      title: 'Scoper job',
      bilbomd_mode: 'scoper',
      fixc1c2: 'false',
      ...bodyOverrides
    },
    files: {
      pdb_file: [{ originalname: 'rna.pdb' }],
      dat_file: [{ originalname: 'saxs.dat' }],
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

const user = {
  _id: 'user-1',
  username: 'user1',
  email: 'u@example.com'
} as unknown as IUser

const UUID = 'uuid-123'

describe('handleBilboMDScoperJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authenticated (user) mode', () => {
    it('returns 200 with jobid and uuid', async () => {
      const { req, res } = makeReqRes()

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(200)
      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload.jobid).toBe('mongo-scoper-1')
      expect(payload.uuid).toBe('uuid-123')
      expect(payload.message).toMatch(/scoper/i)
    })

    it('does not include md_engine in the response', async () => {
      const { req, res } = makeReqRes()

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload).not.toHaveProperty('md_engine')
    })

    it('queues the job without md_engine', async () => {
      const { req, res } = makeReqRes()

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(queueScoperJob).toHaveBeenCalledOnce()
      const queueArg = (queueScoperJob as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(queueArg).not.toHaveProperty('md_engine')
      expect(queueArg.type).toBe('scoper')
      expect(queueArg.uuid).toBe('uuid-123')
      expect(announceNewJob).toHaveBeenCalledOnce()
    })

    it('ignores md_engine even if sent in request body', async () => {
      const { req, res } = makeReqRes({ md_engine: 'OpenMM' })

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(200)
      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload).not.toHaveProperty('md_engine')
    })
  })

  describe('anonymous mode', () => {
    it('returns 200 with publicId and resultUrl but no md_engine', async () => {
      const { req, res } = makeReqRes()

      await handleBilboMDScoperJob(req, res, undefined, UUID, {
        accessMode: 'anonymous',
        publicId: 'pub-abc',
        client_ip_hash: 'hash-123'
      })

      expect(res.status).toHaveBeenCalledWith(200)
      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload.publicId).toBe('pub-abc')
      expect(payload.resultUrl).toContain('/results/pub-abc')
      expect(payload.resultPath).toBe('/results/pub-abc')
      expect(payload).not.toHaveProperty('md_engine')
    })
  })

  describe('SAXS data preparation', () => {
    it('rejects with a dat_file validation error before the schema runs', async () => {
      vi.mocked(prepareSaxsDataFile).mockResolvedValueOnce({
        ok: false,
        message: 'Cannot tell whether q is in Å⁻¹ or nm⁻¹'
      })
      const { req, res } = makeReqRes()

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Validation failed',
        errors: [
          {
            path: 'dat_file',
            message: 'Cannot tell whether q is in Å⁻¹ or nm⁻¹'
          }
        ]
      })
      expect(scoperJobSchema.validate).not.toHaveBeenCalled()
      expect(queueScoperJob).not.toHaveBeenCalled()
    })

    it('passes q_units through and returns the warnings', async () => {
      vi.mocked(prepareSaxsDataFile).mockResolvedValueOnce({
        ok: true,
        warnings: ['q values are in nm⁻¹']
      })
      const { req, res } = makeReqRes({ q_units: 'nm' })

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(prepareSaxsDataFile).toHaveBeenCalledWith(
        expect.objectContaining({ originalname: 'saxs.dat' }),
        'nm'
      )
      expect(scoperJobSchema.validate).toHaveBeenCalledWith(
        expect.objectContaining({ q_units: 'nm' }),
        expect.anything()
      )
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ saxs_warnings: ['q values are in nm⁻¹'] })
      )
    })
  })

  describe('server-placed file fallback', () => {
    it('uses files the server registered when nothing was uploaded', async () => {
      const { req, res } = makeReqRes({}, {})
      ;(req.files as Record<string, unknown>)['pdb_file'] = undefined
      ;(req.files as Record<string, unknown>)['dat_file'] = undefined
      setServerFile(req, 'pdb_file', 'example-rna.pdb')
      setServerFile(req, 'dat_file', 'example-saxs.dat')

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(200)
      expect(scoperJobSchema.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          pdb_file: expect.objectContaining({
            path: expect.stringMatching(
              new RegExp(`/${UUID}/example-rna\\.pdb$`)
            )
          })
        }),
        expect.anything()
      )
    })

    it('ignores file names sent in the request body', async () => {
      const { req, res } = makeReqRes(
        { pdb_file: '../other/rna.pdb', dat_file: '../other/saxs.dat' },
        {}
      )
      ;(req.files as Record<string, unknown>)['pdb_file'] = undefined
      ;(req.files as Record<string, unknown>)['dat_file'] = undefined

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(scoperJobSchema.validate).toHaveBeenCalledWith(
        expect.objectContaining({ pdb_file: undefined, dat_file: undefined }),
        expect.anything()
      )
    })
  })

  describe('error handling', () => {
    it('returns 500 when job save throws', async () => {
      const { req, res } = makeReqRes()

      // Make save throw
      const { BilboMdScoperJob } = await import('@bilbomd/mongodb-schema')
      vi.spyOn(
        BilboMdScoperJob.prototype as { save: () => Promise<unknown> },
        'save'
      ).mockRejectedValueOnce(new Error('DB connection lost'))

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(500)
      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload.message).toMatch(/failed/i)
    })

    it('returns 400 when schema validation rejects shell metacharacters in filename', async () => {
      const { scoperJobSchema } = await import('../../../validation/index.js')
      const err = new ValidationError(
        'Filename contains disallowed characters.',
        undefined,
        'pdb_file'
      )
      vi.mocked(scoperJobSchema.validate).mockRejectedValueOnce(err)

      const { req, res } = makeReqRes(
        {},
        { pdb_file: [{ originalname: 'x$(true).pdb' }] }
      )

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(400)
      const payload = (res.json as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>
      expect(payload.message).toBe('Validation failed')
    })
  })
})
