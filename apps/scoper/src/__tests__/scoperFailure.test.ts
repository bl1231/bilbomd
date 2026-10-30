import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job as BullMQJob } from 'bullmq'
import { Types } from 'mongoose'
import type { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(),
  updateJobStatus: vi.fn(),
  // Fails before SCOPER is spawned, which runScoper reports like any failure
  updateJobResults: vi.fn().mockRejectedValue(new Error('disk full'))
}))

import { runScoper } from '../scoper.functions.js'

const makeJob = () =>
  ({
    _id: new Types.ObjectId(),
    uuid: 'scoper-uuid',
    title: 'RNA'
  }) as unknown as IBilboMDScoperJob

const mqJob = () => ({ attemptsMade: 0, log: vi.fn() }) as unknown as BullMQJob

beforeEach(() => vi.clearAllMocks())

describe('runScoper failure handling', () => {
  it('rethrows the original error so BullMQ records the real reason', async () => {
    await expect(runScoper(mqJob(), makeJob())).rejects.toThrow('disk full')
  })

  it('logs the error to the BullMQ job', async () => {
    const job = mqJob()
    await expect(runScoper(job, makeJob())).rejects.toThrow()
    expect(job.log).toHaveBeenCalledWith('error disk full')
  })
})
