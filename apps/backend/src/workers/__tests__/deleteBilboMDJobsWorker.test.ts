import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'

const {
  requestJobCancellationMock,
  jobFindByIdMock,
  multiJobFindByIdMock,
  pathExistsMock,
  removeMock,
  publishJobEventMock,
  order
} = vi.hoisted(() => ({
  requestJobCancellationMock: vi.fn(),
  jobFindByIdMock: vi.fn(),
  multiJobFindByIdMock: vi.fn(),
  pathExistsMock: vi.fn(),
  removeMock: vi.fn(),
  publishJobEventMock: vi.fn(),
  order: [] as string[]
}))

vi.mock('bullmq', () => ({
  Worker: vi.fn(function () {
    return { on: vi.fn() }
  })
}))
vi.mock('../../queues/redisConn.js', () => ({ redis: {} }))
vi.mock('../../services/jobEvents.js', () => ({
  publishJobEvent: publishJobEventMock
}))
vi.mock('../../queues/cancelJob.js', () => ({
  requestJobCancellation: requestJobCancellationMock
}))
vi.mock('../../config/config.js', () => ({ getEnvVar: () => '/data' }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findById: jobFindByIdMock },
  MultiJob: { findById: multiJobFindByIdMock }
}))
vi.mock('fs-extra', () => ({
  default: { pathExists: pathExistsMock, remove: removeMock }
}))

import {
  processDeleteJob,
  handleDeleteFailed
} from '../deleteBilboMDJobsWorker.js'
import { logger } from '../../middleware/loggers.js'

const bullJob = (mongoId: string) =>
  ({ data: { mongoId } }) as unknown as Job<{ mongoId: string }>

const makeDoc = (uuid: string, user: unknown = { _id: '64b1f0c2a9e4b1d2c3e4f5a1' }) => ({
  uuid,
  title: 't',
  user,
  deleteOne: vi.fn(async () => {
    order.push('deleteOne')
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  requestJobCancellationMock.mockImplementation(async () => {
    order.push('cancel')
    return 0
  })
  pathExistsMock.mockResolvedValue(true)
  removeMock.mockImplementation(async () => {
    order.push('remove')
  })
  publishJobEventMock.mockImplementation(async (_redis, event) => {
    order.push(`event:${event.kind}`)
  })
  multiJobFindByIdMock.mockResolvedValue(null)
})

describe('processDeleteJob', () => {
  it('cancels the job before deleting its document and directory', async () => {
    const doc = makeDoc('uuid-1')
    jobFindByIdMock.mockResolvedValue(doc)

    const result = await processDeleteJob(bullJob('mongo-1'))

    expect(result).toEqual({ status: 'deleted', mongoId: 'mongo-1' })
    expect(requestJobCancellationMock).toHaveBeenCalledWith(
      'mongo-1',
      'job deleted by user'
    )
    expect(order).toEqual(['cancel', 'deleteOne', 'event:deleted', 'remove'])
    expect(removeMock).toHaveBeenCalledWith('/data/uuid-1')
    expect(publishJobEventMock).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'mongo-1',
      ownerId: '64b1f0c2a9e4b1d2c3e4f5a1',
      kind: 'deleted'
    })
  })

  it('cancels multi jobs too', async () => {
    jobFindByIdMock.mockResolvedValue(null)
    // MultiJobs store the owner as a plain ObjectId-like ref
    multiJobFindByIdMock.mockResolvedValue(makeDoc('multi-uuid', '64b1f0c2a9e4b1d2c3e4f5a2'))

    await processDeleteJob(bullJob('mongo-multi'))

    expect(requestJobCancellationMock).toHaveBeenCalledWith(
      'mongo-multi',
      'job deleted by user'
    )
    expect(order).toEqual(['cancel', 'deleteOne', 'event:deleted', 'remove'])
    expect(publishJobEventMock).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'mongo-multi',
      ownerId: '64b1f0c2a9e4b1d2c3e4f5a2',
      kind: 'deleted'
    })
  })

  it('still deletes when the cancellation request fails', async () => {
    jobFindByIdMock.mockResolvedValue(makeDoc('uuid-1'))
    requestJobCancellationMock.mockRejectedValue(new Error('redis down'))

    await expect(processDeleteJob(bullJob('mongo-1'))).resolves.toMatchObject({
      status: 'deleted'
    })
    expect(order).toEqual(['deleteOne', 'event:deleted', 'remove'])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('redis down')
    )
  })

  it('does not cancel anything for an unknown id', async () => {
    jobFindByIdMock.mockResolvedValue(null)

    await expect(processDeleteJob(bullJob('nope'))).rejects.toThrow(
      'No Job or MultiJob found with ID nope'
    )
    expect(requestJobCancellationMock).not.toHaveBeenCalled()
    expect(publishJobEventMock).not.toHaveBeenCalled()
  })

  it('does not announce the deletion if removing the document fails', async () => {
    const doc = makeDoc('uuid-1')
    doc.deleteOne.mockRejectedValue(new Error('mongo down'))
    jobFindByIdMock.mockResolvedValue(doc)

    await expect(processDeleteJob(bullJob('mongo-1'))).rejects.toThrow(
      'mongo down'
    )
    expect(publishJobEventMock).not.toHaveBeenCalled()
  })
})

describe('handleDeleteFailed', () => {
  const failedJob = (attemptsMade: number, attempts = 3) =>
    ({
      data: { mongoId: 'mongo-1' },
      attemptsMade,
      opts: { attempts }
    }) as unknown as Job<{ mongoId: string }>

  it('announces delete_failed after the final attempt when the job still exists', async () => {
    jobFindByIdMock.mockResolvedValue(makeDoc('uuid-1'))

    await handleDeleteFailed(failedJob(3), new Error('boom'))

    expect(publishJobEventMock).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { jobId: 'mongo-1', ownerId: '64b1f0c2a9e4b1d2c3e4f5a1', kind: 'delete_failed' }
    )
  })

  it('stays quiet while BullMQ will retry', async () => {
    jobFindByIdMock.mockResolvedValue(makeDoc('uuid-1'))

    await handleDeleteFailed(failedJob(1), new Error('boom'))

    expect(publishJobEventMock).not.toHaveBeenCalled()
  })

  it('stays quiet when the document is already gone', async () => {
    jobFindByIdMock.mockResolvedValue(null)

    await handleDeleteFailed(failedJob(3), new Error('rm failed'))

    expect(publishJobEventMock).not.toHaveBeenCalled()
  })
})
