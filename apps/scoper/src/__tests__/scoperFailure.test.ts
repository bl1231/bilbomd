import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job as BullMQJob } from 'bullmq'
import { Types } from 'mongoose'
import type { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'

vi.mock('../config/config.js', () => ({
  config: {
    bilbomdUrl: 'https://bilbomd',
    sendEmailNotifications: true,
    bullmqAttempts: 2
  }
}))
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../helpers/mailer.js', () => ({ sendJobCompleteEmail: vi.fn() }))
vi.mock('../helpers/emailPreferences.js', () => ({
  wantsJobEmails: vi.fn()
}))
vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(),
  updateJobStatus: vi.fn(),
  // Fails before SCOPER is spawned, which runScoper reports like any failure
  updateJobResults: vi.fn().mockRejectedValue(new Error('disk full'))
}))
vi.mock('../functions/usageEvents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../functions/usageEvents.js')>()),
  recordWorkerUsageEvent: vi.fn()
}))

import { runScoper } from '../scoper.functions.js'
import { sendJobCompleteEmail } from '../helpers/mailer.js'
import { recordWorkerUsageEvent } from '../functions/usageEvents.js'
import { wantsJobEmails } from '../helpers/emailPreferences.js'

const makeJob = (fields: Partial<IBilboMDScoperJob> = {}) =>
  ({
    _id: new Types.ObjectId(),
    uuid: 'scoper-uuid',
    title: 'RNA',
    access_mode: 'user',
    user: { email: 'alice@example.com' },
    results_token: 'token',
    time_started: new Date(),
    ...fields
  }) as unknown as IBilboMDScoperJob

const mqJob = (attemptsMade: number) =>
  ({ attemptsMade, log: vi.fn() }) as unknown as BullMQJob

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(wantsJobEmails).mockResolvedValue(true)
})

describe('runScoper failure reporting', () => {
  it('does not report a failure BullMQ will retry', async () => {
    await expect(runScoper(mqJob(0), makeJob())).rejects.toThrow()

    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('records job_failed and emails the owner on the last attempt', async () => {
    await expect(runScoper(mqJob(1), makeJob())).rejects.toThrow(
      'BilboMD failed'
    )

    expect(recordWorkerUsageEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        uuid: 'scoper-uuid',
        pipeline: 'scoper',
        eventType: 'job_failed',
        status: 'Error',
        metadata: {
          stage: 'worker',
          step: 'scoper',
          error: 'disk full',
          attempts: 2
        }
      })
    )
    expect(sendJobCompleteEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.any(String),
      expect.any(String),
      'RNA',
      true,
      'token'
    )
  })

  it('records the failure but skips the email when job emails are off', async () => {
    vi.mocked(wantsJobEmails).mockResolvedValue(false)

    await expect(runScoper(mqJob(1), makeJob())).rejects.toThrow()

    expect(recordWorkerUsageEvent).toHaveBeenCalledOnce()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('records anonymous job failures without emailing anyone', async () => {
    const job = makeJob({ access_mode: 'anonymous', user: undefined })

    await expect(runScoper(mqJob(1), job)).rejects.toThrow()

    expect(recordWorkerUsageEvent).toHaveBeenCalledOnce()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })
})
