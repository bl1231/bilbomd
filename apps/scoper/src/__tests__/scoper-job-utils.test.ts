import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import type { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import type { Job as BullMQJob } from 'bullmq'

const { mockUpdateOne, mockFindById, mockSave } = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
  mockFindById: vi.fn(),
  mockSave: vi.fn()
})) as unknown as {
  mockUpdateOne: ReturnType<typeof vi.fn>
  mockFindById: ReturnType<typeof vi.fn>
  mockSave: ReturnType<typeof vi.fn>
}

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { updateOne: mockUpdateOne },
  User: { findById: vi.fn(() => ({ lean: () => ({ exec: mockFindById }) })) },
  Types
}))

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../helpers/mailer.js', () => ({
  sendJobCompleteEmail: vi.fn()
}))

vi.mock('../config/config.js', () => ({
  config: {
    bilbomdUrl: 'http://localhost:3000',
    sendEmailNotifications: true,
    bullmqAttempts: 3
  }
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn().mockResolvedValue(undefined)
}))

import { initializeJob, cleanupJob } from '../scoper-job-utils.js'
import { sendJobCompleteEmail } from '../helpers/mailer.js'
import { User } from '@bilbomd/mongodb-schema'

// Keep a plain type for assertions; cast to the real interface when calling functions
type FakeMQJob = { clearLogs: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn> }
type FakeDBJob = {
  _id: Types.ObjectId
  uuid: string
  title: string
  status: string
  progress: number
  time_started?: Date
  time_completed?: Date
  user: null | string | object
  results_token?: string
  save: ReturnType<typeof vi.fn>
}

const makeMQJob = (): FakeMQJob => ({
  clearLogs: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined)
})

const makeDBJob = (overrides: Partial<FakeDBJob> = {}): FakeDBJob => ({
  _id: new Types.ObjectId(),
  uuid: 'test-uuid',
  title: 'Test Scoper Job',
  status: 'Pending',
  progress: 0,
  time_started: undefined,
  time_completed: undefined,
  user: null,
  results_token: 'scoper-results-token',
  save: mockSave,
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSave.mockResolvedValue(undefined)
  mockUpdateOne.mockResolvedValue({})
})

describe('initializeJob', () => {
  it('clears BullMQ logs, sets status to Running, and saves', async () => {
    const MQjob = makeMQJob()
    const DBjob = makeDBJob()
    await initializeJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    expect(MQjob.clearLogs).toHaveBeenCalledOnce()
    expect(DBjob.status).toBe('Running')
    expect(DBjob.time_started).toBeInstanceOf(Date)
    expect(mockSave).toHaveBeenCalledOnce()
  })

  it('throws and propagates when save fails', async () => {
    const MQjob = makeMQJob()
    const DBjob = makeDBJob()
    mockSave.mockRejectedValueOnce(new Error('save failed'))
    await expect(
      initializeJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    ).rejects.toThrow('save failed')
  })
})

describe('cleanupJob', () => {
  it('marks job completed and skips email when user is null', async () => {
    const MQjob = makeMQJob()
    const DBjob = makeDBJob({ user: null })
    await cleanupJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    expect(DBjob.status).toBe('Completed')
    expect(DBjob.time_completed).toBeInstanceOf(Date)
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('sends email when user is a populated IUser object', async () => {
    const MQjob = makeMQJob()
    const user = { _id: new Types.ObjectId(), email: 'test@example.com', username: 'testuser' }
    const DBjob = makeDBJob({ user })
    await cleanupJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    expect(sendJobCompleteEmail).toHaveBeenCalledWith(
      'test@example.com',
      'http://localhost:3000',
      expect.any(String),
      'Test Scoper Job',
      false,
      'scoper-results-token'
    )
  })

  it('skips email when user has no email address', async () => {
    const MQjob = makeMQJob()
    const user = { _id: new Types.ObjectId(), username: 'anon' }
    const DBjob = makeDBJob({ user })
    await cleanupJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    expect(sendJobCompleteEmail).not.toHaveBeenCalled()
  })

  it('fetches user by ID string when user field is a stored ObjectId string', async () => {
    const MQjob = makeMQJob()
    const userId = new Types.ObjectId()
    const userIdStr = userId.toString()
    const DBjob = makeDBJob({ user: userIdStr })
    mockFindById.mockResolvedValueOnce({
      _id: userId,
      email: 'fetched@example.com',
      username: 'fetched'
    })
    await cleanupJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    expect(User.findById).toHaveBeenCalledWith(userIdStr)
    expect(sendJobCompleteEmail).toHaveBeenCalledWith(
      'fetched@example.com',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      false,
      'scoper-results-token'
    )
  })

  it('throws and propagates when markJobAsCompleted fails', async () => {
    const MQjob = makeMQJob()
    const DBjob = makeDBJob()
    mockSave.mockRejectedValueOnce(new Error('db write error'))
    await expect(
      cleanupJob(MQjob as unknown as BullMQJob, DBjob as unknown as IBilboMDScoperJob)
    ).rejects.toThrow('db write error')
  })
})
