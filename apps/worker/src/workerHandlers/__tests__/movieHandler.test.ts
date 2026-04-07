import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job } from 'bullmq'

// Mock the dependencies
vi.mock('../../services/pipelines/dcd-to-mp4.js', () => ({
  renderMovieJob: vi.fn()
}))

describe('movieHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should re-throw errors from pipeline functions', async () => {
    const { renderMovieJob } = await import(
      '../../services/pipelines/dcd-to-mp4.js'
    )
    const { movieHandler } = await import('../movieHandler.js')

    // Mock the pipeline to throw an error
    vi.mocked(renderMovieJob).mockRejectedValueOnce(
      new Error('Movie rendering failed')
    )

    const mockJob = {
      id: 'test-job-id',
      name: 'render-movie',
      data: {
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    // Verify that the error is re-thrown
    await expect(movieHandler(mockJob)).rejects.toThrow(
      'Movie rendering failed'
    )
  })

  it('should process render-movie job successfully', async () => {
    const { renderMovieJob } = await import(
      '../../services/pipelines/dcd-to-mp4.js'
    )
    const { movieHandler } = await import('../movieHandler.js')

    vi.mocked(renderMovieJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'render-movie',
      data: {
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(movieHandler(mockJob)).resolves.toBeUndefined()
    expect(renderMovieJob).toHaveBeenCalledWith(mockJob)
  })
})
