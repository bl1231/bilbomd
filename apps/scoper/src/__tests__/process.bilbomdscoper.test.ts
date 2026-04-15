import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'

const {
  mockUpdateProgress,
  mockFindOne,
  mockPopulate,
  mockExec,
  mockUpdateJobProgress,
  mockRecordWorkerUsageEvent,
  mockInitializeJob,
  mockRunScoper,
  mockPrepareScoperResults,
  mockCleanupJob
} = vi.hoisted(() => ({
  mockUpdateProgress: vi.fn(),
  mockFindOne: vi.fn(),
  mockPopulate: vi.fn(),
  mockExec: vi.fn(),
  mockUpdateJobProgress: vi.fn(),
  mockRecordWorkerUsageEvent: vi.fn(),
  mockInitializeJob: vi.fn(),
  mockRunScoper: vi.fn(),
  mockPrepareScoperResults: vi.fn(),
  mockCleanupJob: vi.fn()
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  BilboMdScoperJob: {
    findOne: mockFindOne
  }
}))

vi.mock('../mongo-utils.js', () => ({
  updateJobProgress: mockUpdateJobProgress
}))

vi.mock('../functions/usageEvents.js', () => ({
  recordWorkerUsageEvent: mockRecordWorkerUsageEvent,
  buildContext: vi.fn().mockReturnValue({})
}))

vi.mock('../scoper-job-utils.js', () => ({
  initializeJob: mockInitializeJob,
  cleanupJob: mockCleanupJob
}))

vi.mock('../scoper.functions.js', () => ({
  runScoper: mockRunScoper,
  prepareScoperResults: mockPrepareScoperResults
}))

import { processBilboMDScoperJob } from '../process.bilbomdscoper.js'

const makeMQJob = (jobid = 'job123') =>
  ({
    data: { jobid },
    updateProgress: mockUpdateProgress,
    log: vi.fn()
  }) as never

const makeDBJob = () =>
  ({
    _id: new Types.ObjectId(),
    uuid: 'test-uuid',
    title: 'Test Job',
    access_mode: 'user',
    user: { email: 'test@example.com' },
    public_id: 'pub-1',
    client_ip_hash: 'hash-1',
    time_started: new Date(),
    time_completed: new Date()
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateProgress.mockResolvedValue(undefined)
  mockUpdateJobProgress.mockResolvedValue(undefined)
  mockRecordWorkerUsageEvent.mockResolvedValue(undefined)
  mockInitializeJob.mockResolvedValue(undefined)
  mockRunScoper.mockResolvedValue(undefined)
  mockPrepareScoperResults.mockResolvedValue(undefined)
  mockCleanupJob.mockResolvedValue(undefined)
})

const setupFindOne = (job: ReturnType<typeof makeDBJob> | null) => {
  mockExec.mockResolvedValue(job)
  mockPopulate.mockReturnValue({ exec: mockExec })
  mockFindOne.mockReturnValue({ populate: mockPopulate })
}

describe('processBilboMDScoperJob', () => {
  it('runs the full pipeline when job is found', async () => {
    const MQjob = makeMQJob()
    const DBjob = makeDBJob()
    setupFindOne(DBjob)

    await processBilboMDScoperJob(MQjob)

    expect(mockInitializeJob).toHaveBeenCalledWith(MQjob, DBjob)
    expect(mockRunScoper).toHaveBeenCalledWith(MQjob, DBjob)
    expect(mockPrepareScoperResults).toHaveBeenCalledWith(MQjob, DBjob)
    expect(mockCleanupJob).toHaveBeenCalledWith(MQjob, DBjob)
  })

  it('records job_started and job_completed usage events', async () => {
    setupFindOne(makeDBJob())
    await processBilboMDScoperJob(makeMQJob())
    expect(mockRecordWorkerUsageEvent).toHaveBeenCalledTimes(2)
    const calls = mockRecordWorkerUsageEvent.mock.calls
    expect(calls[0][0].eventType).toBe('job_started')
    expect(calls[1][0].eventType).toBe('job_completed')
  })

  it('throws when no job is found in the database', async () => {
    setupFindOne(null)
    await expect(processBilboMDScoperJob(makeMQJob())).rejects.toThrow(
      'No job found for: job123'
    )
  })

  it('reports progress via MQjob.updateProgress', async () => {
    setupFindOne(makeDBJob())
    await processBilboMDScoperJob(makeMQJob())
    expect(mockUpdateProgress).toHaveBeenCalledWith(1)
    expect(mockUpdateProgress).toHaveBeenCalledWith(100)
  })
})
