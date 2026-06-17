import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { analyticsApi, type SummaryAnalytics } from '../analyticsApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockSummaryAnalytics: SummaryAnalytics = {
  users: 150,
  jobs: 2500,
  multijobs: 25,
  jobsCompleted: 2200,
  jobsFailed: 300,
  totalJobsSubmitted: 2800,
  usagePerPipeline: [
    { pipeline: 'pdb', count: 800 },
    { pipeline: 'crd', count: 600 },
    { pipeline: 'auto', count: 500 },
    { pipeline: 'sans', count: 400 },
    { pipeline: 'multi', count: 200 }
  ]
}

const mockJobsByUser = [
  { userId: 'user1', count: 50 },
  { userId: 'user2', count: 30 },
  { userId: 'user3', count: 25 }
]

const mockSuccessRates = [
  { pipeline: 'pdb' as const, successRate: 0.88, total: 800 },
  { pipeline: 'auto' as const, successRate: 0.75, total: 500 }
]

const mockDurationStats = [
  {
    pipeline: 'pdb' as const,
    avgMs: 300000,
    p50Ms: 250000,
    p90Ms: 500000,
    count: 800
  }
]

const mockAccessModeStats = [
  { pipeline: 'pdb' as const, access_mode: 'user' as const, count: 600 },
  { pipeline: 'pdb' as const, access_mode: 'anonymous' as const, count: 200 }
]

const mockDailyCounts = [
  { day: '2023-12-01', pipeline: 'pdb' as const, count: 15 },
  { day: '2023-12-01', pipeline: 'auto' as const, count: 10 }
]

describe('analyticsApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('/api/v1/admin/analytics/summary', () => {
        return HttpResponse.json(mockSummaryAnalytics)
      }),
      http.get('/api/v1/admin/analytics/jobs/by-user', () => {
        return HttpResponse.json(mockJobsByUser)
      }),
      http.get('/api/v1/admin/analytics/jobs/success-rate', () => {
        return HttpResponse.json(mockSuccessRates)
      }),
      http.get('/api/v1/admin/analytics/jobs/duration-stats', () => {
        return HttpResponse.json(mockDurationStats)
      }),
      http.get('/api/v1/admin/analytics/jobs/access-mode', () => {
        return HttpResponse.json(mockAccessModeStats)
      }),
      http.get('/api/v1/admin/analytics/jobs/daily-counts', () => {
        return HttpResponse.json(mockDailyCounts)
      })
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getSummary', () => {
    it('should fetch summary analytics successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getSummary.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getJobsByUser', () => {
    it('should fetch jobs by user successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getJobsByUser.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getUsageSuccessRate', () => {
    it('should fetch success rates by pipeline successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getUsageSuccessRate.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getUsageDurationStats', () => {
    it('should fetch duration statistics successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getUsageDurationStats.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getUsageAccessModeSplit', () => {
    it('should fetch access mode statistics successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getUsageAccessModeSplit.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getUsageDailyCounts', () => {
    it('should fetch daily counts successfully', async () => {
      const result = await storeRef.store.dispatch(
        analyticsApi.endpoints.getUsageDailyCounts.initiate({})
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle server errors gracefully', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/admin/analytics/summary', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        analyticsApi.endpoints.getSummary.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })
})
