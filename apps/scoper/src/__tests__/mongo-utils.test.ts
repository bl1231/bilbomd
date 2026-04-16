import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: {
    updateOne: vi.fn(),
    findByIdAndUpdate: vi.fn()
  }
}))

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { Job } from '@bilbomd/mongodb-schema'
import { logger } from '../helpers/loggers.js'
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
      { $set: { 'steps.foxs': status } }
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
      { 'steps.foxs.status': 'Error' },
      { new: true }
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
      { $set: { 'steps.results': { status: 'Success', message: 'all done' } } }
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
