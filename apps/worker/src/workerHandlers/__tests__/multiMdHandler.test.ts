import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job } from 'bullmq'

// Mock the dependencies
vi.mock('../../services/pipelines/bilbomd-multi.js', () => ({
  processMultiMDJob: vi.fn()
}))

describe('multiMdHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should re-throw errors from pipeline functions', async () => {
    const { processMultiMDJob } = await import(
      '../../services/pipelines/bilbomd-multi.js'
    )
    const { multiMdHandler } = await import('../multiMdHandler.js')

    // Mock the pipeline to throw an error
    vi.mocked(processMultiMDJob).mockRejectedValueOnce(
      new Error('MultiMD pipeline failed')
    )

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'multi',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    // Verify that the error is re-thrown
    await expect(multiMdHandler(mockJob)).rejects.toThrow(
      'MultiMD pipeline failed'
    )
  })

  it('should process multi job successfully', async () => {
    const { processMultiMDJob } = await import(
      '../../services/pipelines/bilbomd-multi.js'
    )
    const { multiMdHandler } = await import('../multiMdHandler.js')

    vi.mocked(processMultiMDJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'multi',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(multiMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processMultiMDJob).toHaveBeenCalledWith(mockJob)
  })
})
