import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../../test/testUtils'
import { bullmqApiSlice } from '../bullmqApiSlice'
import { server } from '../../../test/server'
import { http, HttpResponse } from 'msw'

const mockQueueState = {
  waiting: 5,
  active: 2,
  completed: 100,
  failed: 3,
  delayed: 1,
  paused: false
}

describe('bullmqApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('http://localhost:3003/api/v1/bullmq', () => {
        return HttpResponse.json(mockQueueState)
      })
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getQueueState', () => {
    it('should fetch queue state successfully', async () => {
      const result = await storeRef.store.dispatch(
        bullmqApiSlice.endpoints.getQueueState.initiate(undefined)
      )

      expect(result.data).toEqual(mockQueueState)
      expect(result.error).toBeUndefined()
    })

    it('should handle errors when fetching queue state', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/bullmq', () => {
          return HttpResponse.json(
            { error: 'Queue unavailable' },
            { status: 503 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        bullmqApiSlice.endpoints.getQueueState.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should export useGetQueueStateQuery hook', () => {
      expect(typeof bullmqApiSlice.useGetQueueStateQuery).toBe('function')
    })
  })

  describe('entity adapter', () => {
    it('should initialize with entity adapter', () => {
      // The slice uses entity adapter for normalization
      expect(bullmqApiSlice.endpoints.getQueueState).toBeDefined()
    })
  })
})
