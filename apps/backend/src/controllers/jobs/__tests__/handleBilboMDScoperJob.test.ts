import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'
import { handleBilboMDScoperJob } from '../handleBilboMDScoperJob.js'
import { queueScoperJob } from '../../../queues/scoper.js'
import { ValidationError } from 'yup'

vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
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

  describe('example data fallback', () => {
    it('uses body pdb_file and dat_file when no uploaded files', async () => {
      const { req, res } = makeReqRes(
        { pdb_file: 'example-rna.pdb', dat_file: 'example-saxs.dat' },
        {}
      )
      // Remove the uploaded files so the handler falls back to body values
      ;(req.files as Record<string, unknown>)['pdb_file'] = undefined
      ;(req.files as Record<string, unknown>)['dat_file'] = undefined

      await handleBilboMDScoperJob(req, res, user, UUID, {
        accessMode: 'user'
      })

      expect(res.status).toHaveBeenCalledWith(200)
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
