import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { configApiSlice } from '../configsApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockConfigsResponse = {
  success: true,
  data: {
    maxFileSize: 100000000,
    allowedFileTypes: ['.pdb', '.crd', '.dat'],
    enabledPipelines: ['pdb', 'crd', 'auto', 'sans'],
    serverVersion: '2.1.0',
    maintenanceMode: false,
    apiRateLimit: 100,
    jobTimeout: 3600000,
    maxJobsPerUser: 10
  }
}

describe('configApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('http://localhost:3003/api/v1/configs', () => {
        return HttpResponse.json(mockConfigsResponse)
      })
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getConfigs', () => {
    it('should fetch configs successfully', async () => {
      const result = await storeRef.store.dispatch(
        configApiSlice.endpoints.getConfigs.initiate({})
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle server errors gracefully', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/configs', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        configApiSlice.endpoints.getConfigs.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle network errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/configs', () => {
          return HttpResponse.error()
        })
      )

      try {
        await freshStoreRef.store.dispatch(
          configApiSlice.endpoints.getConfigs.initiate({})
        )
        expect.fail('Expected query to throw')
      } catch (error) {
        expect(error).toBeDefined()
      }

      freshStoreRef.cleanup()
    })

    it('should handle unauthorized access', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/configs', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        configApiSlice.endpoints.getConfigs.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle malformed response data', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/configs', () => {
          return HttpResponse.json(null)
        })
      )

      const result = await freshStoreRef.store.dispatch(
        configApiSlice.endpoints.getConfigs.initiate({})
      )

      expect(result.data).toBeNull()
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })
})
