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

vi.mock('../../services/pipelines/bilbomd-alphafold.js', () => ({
  processBilboMDAlphaFoldJob: vi.fn()
}))

describe('bilboMdHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should re-throw errors from pipeline functions', async () => {
    const { processBilboMDPDBJob } =
      await import('../../services/pipelines/bilbomd-pdb.js')
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

  it('routes alphafold jobs to the local pipeline when not on NERSC', async () => {
    const { processBilboMDAlphaFoldJob } =
      await import('../../services/pipelines/bilbomd-alphafold.js')
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    vi.mocked(processBilboMDAlphaFoldJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'alphafold',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processBilboMDAlphaFoldJob).toHaveBeenCalledWith(mockJob)
  })

  it('should throw error for unknown job types', async () => {
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'unknown_type',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).rejects.toThrow(/Unknown job type/)
  })

  it('should process pdb job successfully', async () => {
    const { processBilboMDPDBJob } =
      await import('../../services/pipelines/bilbomd-pdb.js')
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

  it('should process crd_psf job successfully', async () => {
    const { processBilboMDCRDJob } =
      await import('../../services/pipelines/bilbomd-crd.js')
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    vi.mocked(processBilboMDCRDJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'crd_psf',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processBilboMDCRDJob).toHaveBeenCalledWith(mockJob)
  })

  it('should process auto job successfully', async () => {
    const { processBilboMDAutoJob } =
      await import('../../services/pipelines/bilbomd-auto.js')
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    vi.mocked(processBilboMDAutoJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'auto',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processBilboMDAutoJob).toHaveBeenCalledWith(mockJob)
  })

  it('should process sans job successfully', async () => {
    const { processBilboMDSANSJob } =
      await import('../../services/pipelines/bilbomd-sans.js')
    const { bilboMdHandler } = await import('../bilboMdHandler.js')

    vi.mocked(processBilboMDSANSJob).mockResolvedValueOnce(undefined)

    const mockJob = {
      id: 'test-job-id',
      name: 'test-job',
      data: {
        type: 'sans',
        jobid: 'mongo-job-id'
      },
      log: vi.fn()
    } as unknown as Job

    await expect(bilboMdHandler(mockJob)).resolves.toBeUndefined()
    expect(processBilboMDSANSJob).toHaveBeenCalledWith(mockJob)
  })
})
