import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job } from 'bullmq'

// Mock the dependencies
vi.mock('../../config/config.js', () => ({
  config: {
    runOnNERSC: false
  }
}))

vi.mock('../../services/pipelines/bilbomd-pdb.js', () => ({
  processBilboMDPDBJob: vi.fn()
}))

vi.mock('../../services/pipelines/bilbomd-crd.js', () => ({
  processBilboMDCRDJob: vi.fn()
}))

vi.mock('../../services/pipelines/bilbomd-auto.js', () => ({
  processBilboMDAutoJob: vi.fn()
}))

vi.mock('../../services/pipelines/bilbomd-sans.js', () => ({
  processBilboMDSANSJob: vi.fn()
}))

vi.mock('../../services/pipelines/bilbomd-nersc.js', () => ({
  processBilboMDJobNersc: vi.fn()
}))

describe('bilboMdHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should re-throw errors from pipeline functions', async () => {
    const { processBilboMDPDBJob } = await import(
      '../../services/pipelines/bilbomd-pdb.js'
    )
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    // Mock the pipeline to throw an error
    vi.mocked(processBilboMDPDBJob).mockRejectedValueOnce(
      new Error('Pipeline failed')
    )

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'pdb',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    // Verify that the error is re-thrown
    await expect(bilboMdHandler(mockJob)).rejects.toThrow('Pipeline failed')
  })

  it('should throw error for alphafold jobs when not on NERSC', async () => {
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'alphafold',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).rejects.toThrow(
      /AlphaFold jobs can only be run on NERSC/
    )
  })

  it('should process pdb job successfully', async () => {
    const { processBilboMDPDBJob } = await import(
      '../../services/pipelines/bilbomd-pdb.js'
    )
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    vi.mocked(processBilboMDPDBJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'pdb',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processBilboMDPDBJob).toHaveBeenCalledWith(mockJob)
  })
})
