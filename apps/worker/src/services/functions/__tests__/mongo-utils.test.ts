import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  updateStepStatus,
  handleStepError,
  updateJobStatus
} from '../mongo-utils.js'
import {
  Job,
  buildStepStatusUpdate,
  type IJob,
  type IMultiJob,
  type IBilboMDSteps
} from '@bilbomd/mongodb-schema'
import { logger } from '../../../helpers/loggers.js'
import { notifyJobChanged } from '../../../helpers/jobEvents.js'

vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual = await vi.importActual('@bilbomd/mongodb-schema')
  return {
    ...actual,
    Job: {
      findByIdAndUpdate: vi.fn()
    }
  }
})

describe('mongo-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateStepStatus', () => {
    it('should update step status and save job successfully', async () => {
      const mockJob = {
        _id: 'test-job-id',
        steps: {
          minimize: { status: 'Pending', message: '' }
        } as IBilboMDSteps,
        unmarkModified: vi.fn(),
        updateOne: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      const newStatus = { status: 'Success' as const, message: 'Completed' }

      await updateStepStatus(mockJob, 'minimize', newStatus)

      expect(mockJob.steps.minimize).toEqual(newStatus)
      expect(mockJob.updateOne).toHaveBeenCalledTimes(1)
      expect(mockJob.updateOne).toHaveBeenCalledWith(
        buildStepStatusUpdate('minimize', newStatus),
        { updatePipeline: true }
      )
      expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(mockJob)
    })

    it('keeps previously stored fields on the in-memory step', async () => {
      const startedAt = new Date('2026-09-26T12:00:00Z')
      const mockJob = {
        _id: 'test-job-id',
        steps: {
          md: { status: 'Running', message: 'rg 20', started_at: startedAt }
        } as IBilboMDSteps,
        unmarkModified: vi.fn(),
        updateOne: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await updateStepStatus(mockJob, 'md', {
        status: 'Success',
        message: 'done'
      })

      expect(mockJob.steps.md).toEqual({
        status: 'Success',
        message: 'done',
        started_at: startedAt
      })
    })

    it('should initialize steps object if it does not exist', async () => {
      const mockJob = {
        _id: 'test-job-id',
        steps: undefined,
        unmarkModified: vi.fn(),
        updateOne: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      const newStatus = { status: 'Running' as const, message: 'In progress' }

      await updateStepStatus(mockJob, 'heat', newStatus)

      expect(mockJob.steps).toBeDefined()
      expect(mockJob.steps?.heat).toEqual(newStatus)
      expect(mockJob.updateOne).toHaveBeenCalledTimes(1)
    })

    it('should handle save errors gracefully', async () => {
      const mockJob = {
        _id: 'test-job-id',
        steps: {} as IBilboMDSteps,
        unmarkModified: vi.fn(),
        updateOne: vi
          .fn()
          .mockRejectedValue(new Error('Database connection failed'))
      } as unknown as IJob

      const newStatus = { status: 'Error' as const, message: 'Failed' }

      await updateStepStatus(mockJob, 'md', newStatus)

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error updating step status for job test-job-id'
        )
      )
      expect(notifyJobChanged).not.toHaveBeenCalled()
    })

    it('should work with IMultiJob instances', async () => {
      const mockMultiJob = {
        _id: 'multi-job-id',
        steps: {} as IBilboMDSteps,
        unmarkModified: vi.fn(),
        updateOne: vi.fn().mockResolvedValue(undefined)
      } as unknown as IMultiJob

      const newStatus = { status: 'Success' as const, message: 'Done' }

      await updateStepStatus(mockMultiJob, 'multifoxs', newStatus)

      expect(mockMultiJob.steps.multifoxs).toEqual(newStatus)
      expect(mockMultiJob.updateOne).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleStepError', () => {
    it('should update step status to Error and log the error with Error object', async () => {
      const jobId = 'job-123'
      const stepName = 'foxs'
      const error = new Error('FoXS calculation failed')

      vi.mocked(Job.findByIdAndUpdate).mockResolvedValue(null)

      await handleStepError(jobId, stepName, error)

      expect(Job.findByIdAndUpdate).toHaveBeenCalledWith(
        jobId,
        buildStepStatusUpdate('foxs', { status: 'Error' }),
        { new: true, updatePipeline: true }
      )
      expect(logger.error).toHaveBeenCalledWith(
        'Error in foxs: FoXS calculation failed'
      )
    })

    it('should handle non-Error objects by converting to string', async () => {
      const jobId = 'job-456'
      const stepName = 'minimize'
      const error = 'String error message'

      vi.mocked(Job.findByIdAndUpdate).mockResolvedValue(null)

      await handleStepError(jobId, stepName, error)

      expect(Job.findByIdAndUpdate).toHaveBeenCalledWith(
        jobId,
        buildStepStatusUpdate('minimize', { status: 'Error' }),
        { new: true, updatePipeline: true }
      )
      expect(logger.error).toHaveBeenCalledWith(
        'Error in minimize: String error message'
      )
    })

    it('should handle non-string error values', async () => {
      const jobId = 'job-789'
      const stepName = 'heat'
      const error = { code: 500, message: 'Server error' }

      vi.mocked(Job.findByIdAndUpdate).mockResolvedValue(null)

      await handleStepError(jobId, stepName, error)

      expect(Job.findByIdAndUpdate).toHaveBeenCalledWith(
        jobId,
        buildStepStatusUpdate('heat', { status: 'Error' }),
        { new: true, updatePipeline: true }
      )
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in heat:')
      )
    })
  })

  describe('updateJobStatus', () => {
    it('should update job status and save successfully', async () => {
      const mockJob = {
        _id: 'job-update-test',
        status: 'Pending',
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await updateJobStatus(mockJob, 'Running')

      expect(mockJob.status).toBe('Running')
      expect(mockJob.save).toHaveBeenCalledTimes(1)
      expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(mockJob)
    })

    it('should update job status to Completed', async () => {
      const mockJob = {
        _id: 'job-complete',
        status: 'Running',
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await updateJobStatus(mockJob, 'Completed')

      expect(mockJob.status).toBe('Completed')
      expect(mockJob.save).toHaveBeenCalledTimes(1)
    })

    it('should update job status to Error', async () => {
      const mockJob = {
        _id: 'job-error',
        status: 'Running',
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await updateJobStatus(mockJob, 'Error')

      expect(mockJob.status).toBe('Error')
      expect(mockJob.save).toHaveBeenCalledTimes(1)
    })

    it('should throw error if save fails', async () => {
      const mockJob = {
        _id: 'job-save-fail',
        status: 'Pending',
        save: vi.fn().mockRejectedValue(new Error('Save failed'))
      } as unknown as IJob

      await expect(updateJobStatus(mockJob, 'Running')).rejects.toThrow(
        'Save failed'
      )
    })
  })
})
