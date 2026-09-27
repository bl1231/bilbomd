import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual = await vi.importActual<
    typeof import('@bilbomd/mongodb-schema')
  >('@bilbomd/mongodb-schema')
  return {
    buildStepStatusUpdate: actual.buildStepStatusUpdate,
    Job: {
      updateOne: vi.fn(),
      findByIdAndUpdate: vi.fn()
    }
  }
})

vi.mock('../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { Job, buildStepStatusUpdate } from '@bilbomd/mongodb-schema'
import { logger } from '../helpers/loggers.js'
import { notifyJobChanged } from '../helpers/jobEvents.js'
import {
  updateStepStatus,
  updateJobResults,
  handleStepError,
  updateJobStatus,
  updateJobProgress
} from '../mongo-utils.js'

const makeJob = (id = 'job123') => ({ _id: id }) as never

beforeEach(() => vi.clearAllMocks())

describe('updateStepStatus', () => {
  it('calls Job.updateOne with the correct path', async () => {
    vi.mocked(Job.updateOne).mockResolvedValue({} as never)
    const status = { status: 'Running' as const, message: 'started' }
    await updateStepStatus(makeJob(), 'foxs', status)
    expect(Job.updateOne).toHaveBeenCalledWith(
      { _id: 'job123' },
      buildStepStatusUpdate('foxs', status),
      { updatePipeline: true }
    )
  })

  it('logs error when Job.updateOne throws', async () => {
    vi.mocked(Job.updateOne).mockRejectedValue(new Error('db error'))
    await updateStepStatus(makeJob(), 'foxs', {
      status: 'Error',
      message: 'fail'
    })
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('updateJobResults', () => {
  it('calls Job.updateOne with field updates', async () => {
    vi.mocked(Job.updateOne).mockResolvedValue({} as never)
    await updateJobResults(makeJob(), { 'results.scoper.kgs_files': 42 })
    expect(Job.updateOne).toHaveBeenCalledWith(
      { _id: 'job123' },
      { $set: { 'results.scoper.kgs_files': 42 } }
    )
  })

  it('logs error when Job.updateOne throws', async () => {
    vi.mocked(Job.updateOne).mockRejectedValue(new Error('db error'))
    await updateJobResults(makeJob(), { 'results.scoper.kgs_files': 0 })
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('handleStepError', () => {
  it('calls Job.findByIdAndUpdate and logs the error', async () => {
    vi.mocked(Job.findByIdAndUpdate).mockResolvedValue({} as never)
    await handleStepError('job123', 'foxs', new Error('something broke'))
    expect(Job.findByIdAndUpdate).toHaveBeenCalledWith(
      'job123',
      buildStepStatusUpdate('foxs', { status: 'Error' }),
      { new: true, updatePipeline: true }
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('something broke')
    )
  })

  it('handles non-Error thrown values', async () => {
    vi.mocked(Job.findByIdAndUpdate).mockResolvedValue({} as never)
    await handleStepError('job123', 'foxs', 'plain string error')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('plain string error')
    )
  })
})

describe('updateJobStatus', () => {
  it('delegates to updateStepStatus with a composed IStepStatus', async () => {
    vi.mocked(Job.updateOne).mockResolvedValue({} as never)
    await updateJobStatus(makeJob(), 'results', 'Success', 'all done')
    expect(Job.updateOne).toHaveBeenCalledWith(
      { _id: 'job123' },
      buildStepStatusUpdate('results', {
        status: 'Success',
        message: 'all done'
      }),
      { updatePipeline: true }
    )
  })
})

describe('updateJobProgress', () => {
  it('calls Job.updateOne to set progress', async () => {
    vi.mocked(Job.updateOne).mockResolvedValue({} as never)
    await updateJobProgress(makeJob(), 75)
    expect(Job.updateOne).toHaveBeenCalledWith(
      { _id: 'job123' },
      { $set: { progress: 75 } }
    )
  })

  it('logs error when Job.updateOne throws', async () => {
    vi.mocked(Job.updateOne).mockRejectedValue(new Error('timeout'))
    await updateJobProgress(makeJob(), 50)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('job change notifications', () => {
  const writes = [
    [
      'updateStepStatus',
      (job: never) =>
        updateStepStatus(job, 'foxs', { status: 'Running', message: 'm' })
    ],
    [
      'updateJobResults',
      (job: never) => updateJobResults(job, { 'results.x': 1 })
    ],
    ['updateJobProgress', (job: never) => updateJobProgress(job, 50)]
  ] as const

  it.each(writes)('%s tells the UI after writing', async (_, write) => {
    vi.mocked(Job.updateOne).mockResolvedValue({} as never)
    const job = makeJob()

    await write(job)

    expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(job)
  })

  it.each(writes)('%s stays quiet when the write fails', async (_, write) => {
    vi.mocked(Job.updateOne).mockRejectedValue(new Error('db error'))

    await write(makeJob())

    expect(notifyJobChanged).not.toHaveBeenCalled()
  })
})
