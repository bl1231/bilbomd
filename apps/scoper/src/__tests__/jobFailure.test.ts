import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job as BullMQJob, UnrecoverableError } from 'bullmq'
import { Types } from 'mongoose'

const { findById } = vi.hoisted(() => ({ findById: vi.fn() }))

vi.mock('@bilbomd/mongodb-schema', () => ({
  BilboMdScoperJob: { findById }
}))
vi.mock('../config/config.js', () => ({
  config: { bilbomdUrl: 'https://bilbomd', sendEmailNotifications: true }
}))
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../helpers/mailer.js', () => ({ sendJobCompleteEmail: vi.fn() }))
vi.mock('../helpers/emailPreferences.js', () => ({
  wantsJobEmails: vi.fn()
}))
vi.mock('../helpers/jobEvents.js', () => ({ notifyJobChanged: vi.fn() }))
vi.mock('../mongo-utils.js', () => ({ updateStepStatus: vi.fn() }))
vi.mock('../functions/usageEvents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../functions/usageEvents.js')>()),
  recordWorkerUsageEvent: vi.fn()
}))

import { isFinalAttempt, reportFailedJob } from '../functions/jobFailure.js'
import { sendJobCompleteEmail } from '../helpers/mailer.js'
import { wantsJobEmails } from '../helpers/emailPreferences.js'
import { notifyJobChanged } from '../helpers/jobEvents.js'
import { updateStepStatus } from '../mongo-utils.js'
import { recordWorkerUsageEvent } from '../functions/usageEvents.js'

const KGS_ERROR = 'Scoper - mgclassifierv2.py script exited with code 1'

const makeDoc = (fields: Record<string, unknown> = {}) => {
  const doc = {
    _id: new Types.ObjectId(),
    uuid: 'scoper-uuid',
    title: 'HBV test',
    status: 'Running',
    access_mode: 'user',
    user: { _id: new Types.ObjectId(), email: 'alice@example.com' },
    results_token: 'token',
    time_started: new Date(),
    steps: {
      reduce: { status: 'Success' },
      rnaview: { status: 'Success' },
      kgs: { status: 'Running' },
      foxs: { status: 'Waiting' }
    },
    save: vi.fn(),
    ...fields
  }
  return { ...doc, toObject: () => doc }
}

// Resolves BilboMdScoperJob.findById(...).populate(...).exec()
const loadReturns = (doc: unknown) =>
  findById.mockReturnValue({
    populate: () => ({ exec: vi.fn().mockResolvedValue(doc) })
  })

const mqJob = (attemptsMade: number, attempts = 1) =>
  ({
    id: '44',
    attemptsMade,
    opts: { attempts },
    data: { jobid: 'job-id' }
  }) as unknown as BullMQJob

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(wantsJobEmails).mockResolvedValue(true)
})

describe('isFinalAttempt', () => {
  it('uses the attempts the job was enqueued with', () => {
    const error = new Error('x')
    expect(isFinalAttempt(mqJob(1, 1), error)).toBe(true)
    expect(isFinalAttempt(mqJob(1, 3), error)).toBe(false)
    expect(isFinalAttempt(mqJob(3, 3), error)).toBe(true)
  })

  it('treats an unrecoverable error as final', () => {
    expect(isFinalAttempt(mqJob(1, 3), new UnrecoverableError('x'))).toBe(true)
  })
})

describe('reportFailedJob', () => {
  it('does nothing while BullMQ will still retry', async () => {
    await reportFailedJob(mqJob(1, 3), new Error(KGS_ERROR))

    expect(findById).not.toHaveBeenCalled()
    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
  })

  it('marks the running step and the job Error on the last attempt', async () => {
    const doc = makeDoc()
    loadReturns(doc)

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(updateStepStatus).toHaveBeenCalledExactlyOnceWith(doc, 'kgs', {
      status: 'Error',
      message: KGS_ERROR
    })
    expect(doc.status).toBe('Error')
    expect(doc.save).toHaveBeenCalledOnce()
    expect(notifyJobChanged).toHaveBeenCalledWith(doc)
  })

  it('records job_failed with the step it stopped in', async () => {
    loadReturns(makeDoc())

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(recordWorkerUsageEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        uuid: 'scoper-uuid',
        pipeline: 'scoper',
        eventType: 'job_failed',
        status: 'Error',
        metadata: {
          stage: 'worker',
          step: 'kgs',
          error: KGS_ERROR,
          attempts: 1
        }
      })
    )
  })

  it('falls back to step "scoper" when no step was running', async () => {
    loadReturns(makeDoc({ steps: { reduce: { status: 'Waiting' } } }))

    await reportFailedJob(mqJob(1, 1), new Error('disk full'))

    expect(updateStepStatus).not.toHaveBeenCalled()
    expect(recordWorkerUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ step: 'scoper' })
      })
    )
  })

  it('emails the owner', async () => {
    loadReturns(makeDoc())

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(sendJobCompleteEmail).toHaveBeenCalledWith(
      'alice@example.com',
      'https://bilbomd',
      expect.any(String),
      'HBV test',
      true,
      'token'
    )
  })

  it('skips the email when the owner turned job emails off', async () => {
    vi.mocked(wantsJobEmails).mockResolvedValue(false)
    loadReturns(makeDoc())

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(recordWorkerUsageEvent).toHaveBeenCalledOnce()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('records anonymous job failures without emailing anyone', async () => {
    loadReturns(makeDoc({ access_mode: 'anonymous', user: undefined }))

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(recordWorkerUsageEvent).toHaveBeenCalledOnce()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('does not save a job that is already Error', async () => {
    const doc = makeDoc({ status: 'Error' })
    loadReturns(doc)

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(doc.save).not.toHaveBeenCalled()
  })

  it('skips a job that no longer exists', async () => {
    loadReturns(null)

    await reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))

    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
  })

  it('never throws', async () => {
    findById.mockImplementation(() => {
      throw new Error('mongo down')
    })

    await expect(
      reportFailedJob(mqJob(1, 1), new Error(KGS_ERROR))
    ).resolves.toBeUndefined()
  })
})
