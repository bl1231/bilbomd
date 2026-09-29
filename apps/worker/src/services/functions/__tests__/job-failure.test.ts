import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job as BullMQJob, UnrecoverableError } from 'bullmq'
import { Types } from 'mongoose'
import { BilboMdPDBJob, Job, MultiJob, User } from '@bilbomd/mongodb-schema'
import {
  isFinalAttempt,
  reportFailedJob,
  sendJobFailedEmail
} from '../job-failure.js'
import { JobCancelledError } from '../../../helpers/jobCancellation.js'
import { sendJobCompleteEmail } from '../../../helpers/mailer.js'
import { notifyJobChanged } from '../../../helpers/jobEvents.js'
import { recordWorkerUsageEvent } from '../usage-events.js'
import { config } from '../../../config/config.js'

vi.mock('../../../config/config.js', () => ({
  config: { sendEmailNotifications: true, bilbomdUrl: 'https://bilbomd' }
}))
vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../../helpers/mailer.js', () => ({
  sendJobCompleteEmail: vi.fn()
}))
vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))
vi.mock('../usage-events.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../usage-events.js')>()),
  recordWorkerUsageEvent: vi.fn()
}))

const userId = new Types.ObjectId()

// Real Mongoose documents: steps and user are subdocuments, and anonymous
// jobs get an empty user object rather than undefined
const makePdbJob = (fields: Record<string, unknown> = {}) => {
  const job = new BilboMdPDBJob({
    title: 'My job',
    uuid: 'job-uuid',
    status: 'Error',
    access_mode: 'user',
    user: { _id: userId, username: 'alice', email: 'alice@example.com' },
    results_token: 'results-token',
    time_started: new Date(Date.now() - 60_000),
    steps: {
      minimize: { status: 'Success', message: 'ok' },
      md: { status: 'Error', message: 'Error in step md: boom' }
    },
    ...fields
  })
  vi.spyOn(job, 'save').mockResolvedValue(job)
  return job
}

const findByIdReturning = (model: typeof Job | typeof MultiJob, doc: unknown) =>
  vi.spyOn(model, 'findById').mockReturnValue({
    populate: () => ({ exec: vi.fn().mockResolvedValue(doc) })
  } as never)

const mqJob = (attemptsMade: number, attempts = 2) =>
  ({
    id: 'mq-1',
    data: { jobid: 'job-id' },
    attemptsMade,
    opts: { attempts }
  }) as unknown as BullMQJob

const recorded = () => vi.mocked(recordWorkerUsageEvent).mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  config.sendEmailNotifications = true
})

describe('isFinalAttempt', () => {
  it('is false while BullMQ still has attempts left', () => {
    expect(isFinalAttempt(mqJob(1, 2), new Error('x'))).toBe(false)
  })

  it('is true once every attempt is used', () => {
    expect(isFinalAttempt(mqJob(2, 2), new Error('x'))).toBe(true)
  })

  it('is true for unrecoverable errors, which BullMQ never retries', () => {
    expect(isFinalAttempt(mqJob(1, 2), new UnrecoverableError('x'))).toBe(true)
    expect(isFinalAttempt(mqJob(1, 2), new JobCancelledError('x'))).toBe(true)
  })

  it('treats a job without an attempts option as a single attempt', () => {
    const job = { attemptsMade: 1, opts: {} } as unknown as BullMQJob
    expect(isFinalAttempt(job, new Error('x'))).toBe(true)
  })
})

describe('reportFailedJob', () => {
  it('does nothing while BullMQ will retry the job', async () => {
    const findById = vi.spyOn(Job, 'findById')

    await reportFailedJob('bilbomd', mqJob(1), new Error('boom'))

    expect(findById).not.toHaveBeenCalled()
    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('records job_failed with the failing step and emails the owner', async () => {
    const job = makePdbJob()
    findByIdReturning(Job, job)

    await reportFailedJob('bilbomd', mqJob(2), new Error('boom'))

    expect(recorded()).toMatchObject({
      uuid: 'job-uuid',
      pipeline: 'pdb',
      eventType: 'job_failed',
      status: 'Error',
      context: {
        access_mode: 'user',
        user: { username: 'alice', email: 'alice@example.com' }
      },
      metadata: { stage: 'worker', step: 'md', error: 'boom', attempts: 2 }
    })
    expect(recorded()?.durationMs).toBeGreaterThanOrEqual(60_000)
    expect(sendJobCompleteEmail).toHaveBeenCalledExactlyOnceWith(
      'alice@example.com',
      'https://bilbomd',
      job._id.toString(),
      'My job',
      true,
      'results-token'
    )
    // Already Error (set by handleError), so no extra write
    expect(job.save).not.toHaveBeenCalled()
  })

  it('marks a job Error when it failed outside a pipeline step', async () => {
    const job = makePdbJob({ status: 'Running', steps: {} })
    findByIdReturning(Job, job)

    await reportFailedJob('bilbomd', mqJob(2), new Error('no engine'))

    expect(job.status).toBe('Error')
    expect(job.save).toHaveBeenCalled()
    expect(notifyJobChanged).toHaveBeenCalledWith(job)
    expect(recorded()?.metadata).toMatchObject({ step: undefined })
  })

  it('records anonymous job failures without emailing anyone', async () => {
    const job = makePdbJob({
      access_mode: 'anonymous',
      user: undefined,
      public_id: 'public-1',
      client_ip_hash: 'hash'
    })
    findByIdReturning(Job, job)

    await reportFailedJob('bilbomd', mqJob(2), new Error('boom'))

    expect(recorded()).toMatchObject({
      eventType: 'job_failed',
      context: { access_mode: 'anonymous', public_id: 'public-1' }
    })
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('records a cancelled job as job_cancelled, with no email', async () => {
    const job = makePdbJob()
    findByIdReturning(Job, job)

    await reportFailedJob(
      'bilbomd',
      mqJob(1),
      new JobCancelledError('Job cancelled: deleted')
    )

    expect(recorded()).toMatchObject({
      eventType: 'job_cancelled',
      status: 'Cancelled',
      metadata: { reason: 'Job cancelled: deleted' }
    })
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('skips jobs that no longer exist (deleted)', async () => {
    findByIdReturning(Job, null)

    await reportFailedJob('bilbomd', mqJob(2), new Error('boom'))

    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
  })

  it('reports multi jobs from the MultiJob collection', async () => {
    const job = new MultiJob({
      title: 'Multi',
      uuid: 'multi-uuid',
      bilbomd_uuids: ['a', 'b'],
      data_file_from: 'a',
      user: userId,
      status: 'Error'
    })
    // What populate('user') gives the reporter
    job.user = new User({
      _id: userId,
      username: 'bob',
      email: 'bob@example.com'
    })
    findByIdReturning(MultiJob, job)

    await reportFailedJob('multimd', mqJob(2), new Error('multifoxs failed'))

    expect(recorded()).toMatchObject({
      uuid: 'multi-uuid',
      pipeline: 'multi',
      eventType: 'job_failed'
    })
    expect(sendJobCompleteEmail).toHaveBeenCalledWith(
      'bob@example.com',
      'https://bilbomd',
      job._id.toString(),
      'Multi',
      true,
      undefined
    )
  })

  it('never throws, even when reporting fails', async () => {
    vi.spyOn(Job, 'findById').mockImplementation(() => {
      throw new Error('mongo down')
    })

    await expect(
      reportFailedJob('bilbomd', mqJob(2), new Error('boom'))
    ).resolves.toBeUndefined()
  })

  it('ignores a failed event without a job', async () => {
    await reportFailedJob('bilbomd', undefined, new Error('boom'))
    expect(recordWorkerUsageEvent).not.toHaveBeenCalled()
  })
})

describe('sendJobFailedEmail', () => {
  it('looks up the owner when the job was loaded without populate', async () => {
    const job = makePdbJob()
    const lean = vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ email: 'carol@example.com' })
    }))
    vi.spyOn(User, 'findById').mockReturnValue({ lean } as never)
    // An unpopulated ref, as on MultiJob or NERSC monitor queries
    Object.defineProperty(job, 'user', { value: userId })

    expect(await sendJobFailedEmail(job)).toBe('carol@example.com')
    expect(User.findById).toHaveBeenCalledWith(userId)
  })

  it('sends nothing when email notifications are off', async () => {
    config.sendEmailNotifications = false

    expect(await sendJobFailedEmail(makePdbJob())).toBeUndefined()
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })
})
