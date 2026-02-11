// apps/backend/src/middleware/__tests__/jobCleaner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import fs from 'fs-extra'
import path from 'path'
import { deleteOldJobs } from '../jobCleaner.js'
import { Job, MultiJob } from '@bilbomd/mongodb-schema'
import { logger } from '../loggers.js'

vi.mock('mongoose', async () => {
  const actual = await vi.importActual('mongoose')
  return {
    ...actual,
    default: {
      connection: {
        readyState: 1
      }
    }
  }
})

vi.mock('../config/dbConn.js', () => ({
  connectDB: vi.fn()
}))

vi.mock('fs-extra')
vi.mock('../loggers.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: {
    find: vi.fn(),
    deleteMany: vi.fn()
  },
  MultiJob: {
    find: vi.fn(),
    deleteMany: vi.fn()
  }
}))

interface MockJobDocument {
  uuid: string
  title: string
  user: string
  time_completed: Date
  createdAt: Date
}

interface MockMultiJobDocument {
  uuid: string
  title: string
  user: string
  time_completed: Date
  createdAt: Date
}

interface MockQueryChain<T> {
  lean: () => MockQueryChain<T>
  exec: () => Promise<T[]>
}

interface MockDeleteResult {
  exec: () => Promise<{ deletedCount: number }>
}

describe('deleteOldJobs', () => {
  const mockDataVol = process.env.DATA_VOL || '/tmp/bilbomd-data'

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 1,
      writable: true,
      configurable: true
    })
  })

  describe('when no old jobs exist', () => {
    it('should handle empty job results gracefully', async () => {
      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      await deleteOldJobs()

      expect(logger.warn).toHaveBeenCalledWith('Deleted 0 jobs from MongoDB')
      expect(logger.warn).toHaveBeenCalledWith(
        'Deleted 0 multi-jobs from MongoDB'
      )
    })
  })

  describe('when old jobs exist', () => {
    it('should delete jobs older than 30 days from database and filesystem', async () => {
      const mockJobs: MockJobDocument[] = [
        {
          uuid: 'job-uuid-1',
          title: 'Old Job 1',
          user: 'user1',
          time_completed: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01')
        },
        {
          uuid: 'job-uuid-2',
          title: 'Old Job 2',
          user: 'user2',
          time_completed: new Date('2024-01-02'),
          createdAt: new Date('2024-01-02')
        }
      ]

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockJobs)
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 2 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      vi.mocked(fs.pathExists).mockResolvedValue(true as never)
      vi.mocked(fs.remove).mockResolvedValue(undefined as never)

      await deleteOldJobs()

      expect(logger.warn).toHaveBeenCalledWith(
        'Found 2 jobs older than 1 month.'
      )
      expect(fs.remove).toHaveBeenCalledWith(
        path.join(mockDataVol, 'job-uuid-1')
      )
      expect(fs.remove).toHaveBeenCalledWith(
        path.join(mockDataVol, 'job-uuid-2')
      )
      expect(logger.warn).toHaveBeenCalledWith('Deleted 2 jobs from MongoDB')
    })

    it('should delete old multi-jobs from database and filesystem', async () => {
      const mockMultiJobs: MockMultiJobDocument[] = [
        {
          uuid: 'multi-job-uuid-1',
          title: 'Old Multi Job',
          user: 'user1',
          time_completed: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01')
        }
      ]

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockMultiJobs)
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      vi.mocked(fs.pathExists).mockResolvedValue(true as never)
      vi.mocked(fs.remove).mockResolvedValue(undefined as never)

      await deleteOldJobs()

      expect(logger.warn).toHaveBeenCalledWith(
        'Found 1 multi-jobs older than 1 month.'
      )
      expect(fs.remove).toHaveBeenCalledWith(
        path.join(mockDataVol, 'multi-job-uuid-1')
      )
      expect(logger.warn).toHaveBeenCalledWith(
        'Deleted 1 multi-jobs from MongoDB'
      )
    })

    it('should query jobs with correct date threshold', async () => {
      const now = new Date('2025-02-10T00:00:00Z')
      const expectedThreshold = new Date('2025-01-11T00:00:00Z')

      vi.useFakeTimers()
      vi.setSystemTime(now)

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      await deleteOldJobs()

      expect(Job.find).toHaveBeenCalledWith({
        createdAt: { $lt: expectedThreshold }
      })

      expect(MultiJob.find).toHaveBeenCalledWith({
        createdAt: { $lt: expectedThreshold }
      })

      vi.useRealTimers()
    })
  })

  describe('error handling', () => {
    it('should log warning when job directory does not exist', async () => {
      const mockJobs: MockJobDocument[] = [
        {
          uuid: 'missing-job-uuid',
          title: 'Job with missing directory',
          user: 'user1',
          time_completed: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01')
        }
      ]

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockJobs)
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      vi.mocked(fs.pathExists).mockResolvedValue(false as never)

      await deleteOldJobs()

      const expectedPath = path.join(mockDataVol, 'missing-job-uuid')
      expect(logger.warn).toHaveBeenCalledWith(
        `Directory ${expectedPath} not found on disk`
      )
      expect(fs.remove).not.toHaveBeenCalled()
    })

    it('should handle filesystem errors gracefully and continue processing', async () => {
      const mockJobs: MockJobDocument[] = [
        {
          uuid: 'error-job-uuid',
          title: 'Job with fs error',
          user: 'user1',
          time_completed: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01')
        }
      ]

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockJobs)
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      const fsError = new Error('Permission denied')
      vi.mocked(fs.pathExists).mockRejectedValue(fsError)

      await deleteOldJobs()

      const expectedPath = path.join(mockDataVol, 'error-job-uuid')
      expect(logger.error).toHaveBeenCalledWith(
        `Error deleting job directory: ${expectedPath} ${fsError}`
      )
      expect(logger.warn).toHaveBeenCalledWith('Deleted 1 jobs from MongoDB')
    })

    it('should handle multi-job filesystem errors gracefully', async () => {
      const mockMultiJobs: MockMultiJobDocument[] = [
        {
          uuid: 'error-multi-job-uuid',
          title: 'Multi Job with fs error',
          user: 'user1',
          time_completed: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01')
        }
      ]

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockMultiJobs)
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      const fsError = new Error('Disk full')
      vi.mocked(fs.pathExists).mockResolvedValue(true as never)
      vi.mocked(fs.remove).mockRejectedValue(fsError)

      await deleteOldJobs()

      const expectedPath = path.join(mockDataVol, 'error-multi-job-uuid')
      expect(logger.error).toHaveBeenCalledWith(
        `Error deleting multi-job directory: ${expectedPath} ${fsError}`
      )
      expect(logger.warn).toHaveBeenCalledWith(
        'Deleted 1 multi-jobs from MongoDB'
      )
    })

    it('should log error and continue if database query fails', async () => {
      const dbError = new Error('Database connection lost')

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(dbError)
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )

      await deleteOldJobs()

      expect(logger.error).toHaveBeenCalledWith(
        `Error deleting old jobs: ${dbError}`
      )
    })
  })

  describe('database connection', () => {
    it('should reconnect if database connection is closed', async () => {
      const dbConnModule = await import('../../config/dbConn.js')
      const connectDBSpy = vi.spyOn(dbConnModule, 'connectDB')
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 0,
        writable: true,
        configurable: true
      })

      const mockJobFind: MockQueryChain<MockJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      const mockMultiJobFind: MockQueryChain<MockMultiJobDocument> = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      }

      const mockMultiJobDelete: MockDeleteResult = {
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 })
      }

      vi.mocked(Job.find).mockReturnValue(
        mockJobFind as unknown as ReturnType<typeof Job.find>
      )
      vi.mocked(Job.deleteMany).mockReturnValue(
        mockJobDelete as unknown as ReturnType<typeof Job.deleteMany>
      )

      vi.mocked(MultiJob.find).mockReturnValue(
        mockMultiJobFind as unknown as ReturnType<typeof MultiJob.find>
      )
      vi.mocked(MultiJob.deleteMany).mockReturnValue(
        mockMultiJobDelete as unknown as ReturnType<typeof MultiJob.deleteMany>
      )

      await deleteOldJobs()

      expect(connectDBSpy).toHaveBeenCalled()
    })
  })
})
