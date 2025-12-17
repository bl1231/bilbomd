import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { statsApiSlice } from '../statsApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

interface Stats {
  userCount: number
  jobCount: number
  totalJobsFromUsers: number
  jobTypes: Record<string, number>
}

const mockStatsData: Stats = {
  userCount: 150,
  jobCount: 2500,
  totalJobsFromUsers: 2300,
  jobTypes: {
    pdb: 800,
    crd: 600,
    auto: 500,
    sans: 400,
    multi: 200
  }
}

const mockStatsResponse = {
  success: true,
  data: mockStatsData
}

describe('statsApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('http://localhost:3003/api/v1/stats', () => {
        return HttpResponse.json({
          success: true,
          data: mockStatsData
        })
      })
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getStats', () => {
    it('should fetch stats successfully', async () => {
      const result = await storeRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle server errors gracefully', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle network errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.error()
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle malformed success response', async () => {
      const freshStoreRef = setupApiStore()

      const malformedResponse = {
        success: false,
        data: null
      }

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.json(malformedResponse)
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.data).toBeNull()
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle unauthorized access', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle missing data in response', async () => {
      const freshStoreRef = setupApiStore()

      const responseWithoutData = {
        success: true
        // Missing 'data' property
      }

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.json(responseWithoutData)
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.data).toBeUndefined()
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle empty job types', async () => {
      const freshStoreRef = setupApiStore()

      const emptyJobTypesResponse = {
        success: true,
        data: {
          ...mockStatsData,
          jobTypes: {}
        }
      }

      server.use(
        http.get('http://localhost:3003/api/v1/stats', () => {
          return HttpResponse.json(emptyJobTypesResponse)
        })
      )

      const result = await freshStoreRef.store.dispatch(
        statsApiSlice.endpoints.getStats.initiate({})
      )

      expect(result.data?.jobTypes).toEqual({})
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })
})
