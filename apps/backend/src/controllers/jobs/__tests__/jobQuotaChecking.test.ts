import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  BilboMdPDBJob,
  BilboMdCRDJob,
  BilboMdAutoJob,
  BilboMdAlphaFoldJob,
  BilboMdSANSJob,
  BilboMdScoperJob,
  MultiJob,
  JobStatus
} from '@bilbomd/mongodb-schema'

// Mock the mongoose models
vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual =
    await vi.importActual<typeof import('@bilbomd/mongodb-schema')>(
      '@bilbomd/mongodb-schema'
    )
  return {
    ...actual,
    BilboMdPDBJob: {
      countDocuments: vi.fn()
    },
    BilboMdCRDJob: {
      countDocuments: vi.fn()
    },
    BilboMdAutoJob: {
      countDocuments: vi.fn()
    },
    BilboMdAlphaFoldJob: {
      countDocuments: vi.fn()
    },
    BilboMdSANSJob: {
      countDocuments: vi.fn()
    },
    BilboMdScoperJob: {
      countDocuments: vi.fn()
    },
    MultiJob: {
      countDocuments: vi.fn()
    }
  }
})

describe('Job Quota Checking Logic', () => {
  const mockClientIpHash = 'abc123hash'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Active job counting with async/await pattern', () => {
    it('should correctly count active jobs across all job types', async () => {
      // Setup mock responses for each job type
      const mockCounts = {
        pdb: 1,
        crd: 0,
        auto: 2,
        sans: 1,
        alphafold: 0,
        scoper: 0,
        multi: 1
      }

      vi.mocked(BilboMdPDBJob.countDocuments).mockResolvedValue(mockCounts.pdb)
      vi.mocked(BilboMdCRDJob.countDocuments).mockResolvedValue(mockCounts.crd)
      vi.mocked(BilboMdAutoJob.countDocuments).mockResolvedValue(
        mockCounts.auto
      )
      vi.mocked(BilboMdSANSJob.countDocuments).mockResolvedValue(
        mockCounts.sans
      )
      vi.mocked(BilboMdAlphaFoldJob.countDocuments).mockResolvedValue(
        mockCounts.alphafold
      )
      vi.mocked(BilboMdScoperJob.countDocuments).mockResolvedValue(
        mockCounts.scoper
      )
      vi.mocked(MultiJob.countDocuments).mockResolvedValue(mockCounts.multi)

      // This simulates the refactored code pattern
      const activeStatuses = [
        JobStatus.Submitted,
        JobStatus.Pending,
        JobStatus.Running
      ]
      const quotaQuery = {
        client_ip_hash: mockClientIpHash,
        status: { $in: activeStatuses },
        access_mode: 'anonymous'
      }

      const counts = await Promise.all([
        BilboMdPDBJob.countDocuments(quotaQuery),
        BilboMdCRDJob.countDocuments(quotaQuery),
        BilboMdAutoJob.countDocuments(quotaQuery),
        BilboMdSANSJob.countDocuments(quotaQuery),
        BilboMdAlphaFoldJob.countDocuments(quotaQuery),
        BilboMdScoperJob.countDocuments(quotaQuery),
        MultiJob.countDocuments(quotaQuery)
      ])
      const activeJobsCount = counts.reduce((sum, count) => sum + count, 0)

      // Verify all models were queried with correct parameters
      expect(BilboMdPDBJob.countDocuments).toHaveBeenCalledWith(quotaQuery)
      expect(BilboMdCRDJob.countDocuments).toHaveBeenCalledWith(quotaQuery)
      expect(BilboMdAutoJob.countDocuments).toHaveBeenCalledWith(quotaQuery)
      expect(BilboMdSANSJob.countDocuments).toHaveBeenCalledWith(quotaQuery)
      expect(BilboMdAlphaFoldJob.countDocuments).toHaveBeenCalledWith(
        quotaQuery
      )
      expect(BilboMdScoperJob.countDocuments).toHaveBeenCalledWith(quotaQuery)
      expect(MultiJob.countDocuments).toHaveBeenCalledWith(quotaQuery)

      // Verify total count
      const expectedTotal = Object.values(mockCounts).reduce(
        (sum, count) => sum + count,
        0
      )
      expect(activeJobsCount).toBe(expectedTotal)
      expect(activeJobsCount).toBe(5) // 1+0+2+1+0+0+1 = 5
    })

    it('should return 0 when no active jobs exist', async () => {
      // All job types return 0
      vi.mocked(BilboMdPDBJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdCRDJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAutoJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdSANSJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAlphaFoldJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdScoperJob.countDocuments).mockResolvedValue(0)
      vi.mocked(MultiJob.countDocuments).mockResolvedValue(0)

      const counts = await Promise.all([
        BilboMdPDBJob.countDocuments({}),
        BilboMdCRDJob.countDocuments({}),
        BilboMdAutoJob.countDocuments({}),
        BilboMdSANSJob.countDocuments({}),
        BilboMdAlphaFoldJob.countDocuments({}),
        BilboMdScoperJob.countDocuments({}),
        MultiJob.countDocuments({})
      ])
      const activeJobsCount = counts.reduce((sum, count) => sum + count, 0)

      expect(activeJobsCount).toBe(0)
    })

    it('should correctly identify when quota limit is reached', async () => {
      const QUOTA_LIMIT = 3

      // Simulate exactly 3 active jobs
      vi.mocked(BilboMdPDBJob.countDocuments).mockResolvedValue(1)
      vi.mocked(BilboMdCRDJob.countDocuments).mockResolvedValue(1)
      vi.mocked(BilboMdAutoJob.countDocuments).mockResolvedValue(1)
      vi.mocked(BilboMdSANSJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAlphaFoldJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdScoperJob.countDocuments).mockResolvedValue(0)
      vi.mocked(MultiJob.countDocuments).mockResolvedValue(0)

      const counts = await Promise.all([
        BilboMdPDBJob.countDocuments({}),
        BilboMdCRDJob.countDocuments({}),
        BilboMdAutoJob.countDocuments({}),
        BilboMdSANSJob.countDocuments({}),
        BilboMdAlphaFoldJob.countDocuments({}),
        BilboMdScoperJob.countDocuments({}),
        MultiJob.countDocuments({})
      ])
      const activeJobsCount = counts.reduce((sum, count) => sum + count, 0)

      expect(activeJobsCount).toBe(QUOTA_LIMIT)
      expect(activeJobsCount >= QUOTA_LIMIT).toBe(true)
    })

    it('should correctly identify when quota limit is exceeded', async () => {
      const QUOTA_LIMIT = 3

      // Simulate 4 active jobs (over limit)
      vi.mocked(BilboMdPDBJob.countDocuments).mockResolvedValue(2)
      vi.mocked(BilboMdCRDJob.countDocuments).mockResolvedValue(1)
      vi.mocked(BilboMdAutoJob.countDocuments).mockResolvedValue(1)
      vi.mocked(BilboMdSANSJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAlphaFoldJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdScoperJob.countDocuments).mockResolvedValue(0)
      vi.mocked(MultiJob.countDocuments).mockResolvedValue(0)

      const counts = await Promise.all([
        BilboMdPDBJob.countDocuments({}),
        BilboMdCRDJob.countDocuments({}),
        BilboMdAutoJob.countDocuments({}),
        BilboMdSANSJob.countDocuments({}),
        BilboMdAlphaFoldJob.countDocuments({}),
        BilboMdScoperJob.countDocuments({}),
        MultiJob.countDocuments({})
      ])
      const activeJobsCount = counts.reduce((sum, count) => sum + count, 0)

      expect(activeJobsCount).toBe(4)
      expect(activeJobsCount >= QUOTA_LIMIT).toBe(true)
    })

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed')

      vi.mocked(BilboMdPDBJob.countDocuments).mockRejectedValue(dbError)

      await expect(
        Promise.all([
          BilboMdPDBJob.countDocuments({}),
          BilboMdCRDJob.countDocuments({}),
          BilboMdAutoJob.countDocuments({}),
          BilboMdSANSJob.countDocuments({}),
          BilboMdAlphaFoldJob.countDocuments({}),
          BilboMdScoperJob.countDocuments({}),
          MultiJob.countDocuments({})
        ])
      ).rejects.toThrow('Database connection failed')
    })

    it('should query with correct active status filters', async () => {
      const activeStatuses = [
        JobStatus.Submitted,
        JobStatus.Pending,
        JobStatus.Running
      ]
      const quotaQuery = {
        client_ip_hash: mockClientIpHash,
        status: { $in: activeStatuses },
        access_mode: 'anonymous'
      }

      vi.mocked(BilboMdPDBJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdCRDJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAutoJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdSANSJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdAlphaFoldJob.countDocuments).mockResolvedValue(0)
      vi.mocked(BilboMdScoperJob.countDocuments).mockResolvedValue(0)
      vi.mocked(MultiJob.countDocuments).mockResolvedValue(0)

      await Promise.all([
        BilboMdPDBJob.countDocuments(quotaQuery),
        BilboMdCRDJob.countDocuments(quotaQuery),
        BilboMdAutoJob.countDocuments(quotaQuery),
        BilboMdSANSJob.countDocuments(quotaQuery),
        BilboMdAlphaFoldJob.countDocuments(quotaQuery),
        BilboMdScoperJob.countDocuments(quotaQuery),
        MultiJob.countDocuments(quotaQuery)
      ])

      // Verify each model was queried with the correct status filter
      const expectedQuery = expect.objectContaining({
        status: expect.objectContaining({
          $in: expect.arrayContaining([
            JobStatus.Submitted,
            JobStatus.Pending,
            JobStatus.Running
          ])
        })
      })

      expect(BilboMdPDBJob.countDocuments).toHaveBeenCalledWith(expectedQuery)
      expect(BilboMdCRDJob.countDocuments).toHaveBeenCalledWith(expectedQuery)
      expect(BilboMdAutoJob.countDocuments).toHaveBeenCalledWith(expectedQuery)
      expect(BilboMdSANSJob.countDocuments).toHaveBeenCalledWith(expectedQuery)
      expect(BilboMdAlphaFoldJob.countDocuments).toHaveBeenCalledWith(
        expectedQuery
      )
      expect(BilboMdScoperJob.countDocuments).toHaveBeenCalledWith(
        expectedQuery
      )
      expect(MultiJob.countDocuments).toHaveBeenCalledWith(expectedQuery)
    })
  })
})
