import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'

const {
  requestJobCancellationMock,
  jobFindByIdMock,
  multiJobFindByIdMock,
  pathExistsMock,
  removeMock,
  order
} = vi.hoisted(() => ({
  requestJobCancellationMock: vi.fn(),
  jobFindByIdMock: vi.fn(),
  multiJobFindByIdMock: vi.fn(),
  pathExistsMock: vi.fn(),
  removeMock: vi.fn(),
  order: [] as string[]
}))

vi.mock('bullmq', () => ({ Worker: vi.fn() }))
vi.mock('../../queues/redisConn.js', () => ({ redis: {} }))
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

import { processDeleteJob } from '../deleteBilboMDJobsWorker.js'
import { logger } from '../../middleware/loggers.js'

const bullJob = (mongoId: string) =>
  ({ data: { mongoId } }) as unknown as Job<{ mongoId: string }>

const makeDoc = (uuid: string) => ({
  uuid,
  title: 't',
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
    expect(order).toEqual(['cancel', 'deleteOne', 'remove'])
    expect(removeMock).toHaveBeenCalledWith('/data/uuid-1')
  })

  it('cancels multi jobs too', async () => {
    jobFindByIdMock.mockResolvedValue(null)
    multiJobFindByIdMock.mockResolvedValue(makeDoc('multi-uuid'))

    await processDeleteJob(bullJob('mongo-multi'))

    expect(requestJobCancellationMock).toHaveBeenCalledWith(
      'mongo-multi',
      'job deleted by user'
    )
    expect(order).toEqual(['cancel', 'deleteOne', 'remove'])
  })

  it('still deletes when the cancellation request fails', async () => {
    jobFindByIdMock.mockResolvedValue(makeDoc('uuid-1'))
    requestJobCancellationMock.mockRejectedValue(new Error('redis down'))

    await expect(processDeleteJob(bullJob('mongo-1'))).resolves.toMatchObject({
      status: 'deleted'
    })
    expect(order).toEqual(['deleteOne', 'remove'])
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
  })
})
