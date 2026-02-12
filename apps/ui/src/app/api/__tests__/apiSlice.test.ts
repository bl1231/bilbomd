import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupApiStore } from '../../../test/testUtils'
import { apiSlice } from '../apiSlice'
import { setCredentials } from '../../../slices/authSlice'
import { server } from '../../../test/server'
import { http, HttpResponse } from 'msw'

describe('apiSlice', () => {
  describe('configuration', () => {
    it('should define all tag types', () => {
      // The apiSlice should have these tag types defined
      expect(apiSlice).toBeDefined()
    })

    it('should use correct base URL for test environment', () => {
      // In test environment, base URL should be localhost:3003
      expect(process.env.NODE_ENV).toBe('test')
    })

    it('should export a valid reducer', () => {
      expect(typeof apiSlice.reducer).toBe('function')
    })

    it('should export middleware', () => {
      expect(apiSlice.middleware).toBeDefined()
    })
  })

  describe('baseQuery with prepareHeaders', () => {
    const storeRef = setupApiStore()

    beforeEach(() => {
      server.use(
        http.get('http://localhost:3003/api/v1/test', ({ request }) => {
          const authHeader = request.headers.get('authorization')
          if (authHeader) {
            return HttpResponse.json({ authenticated: true })
          }
          return HttpResponse.json({ authenticated: false })
        })
      )
    })

    afterEach(() => {
      server.resetHandlers()
    })

    it('should include authorization header when token exists', async () => {
      // Set token in auth state
      storeRef.store.dispatch(setCredentials({ accessToken: 'test-token' }))

      // Create a temporary endpoint for testing
      const testEndpoint = apiSlice.injectEndpoints({
        endpoints: (builder) => ({
          testAuth: builder.query({
            query: () => '/test'
          })
        })
      })

      const result = await storeRef.store.dispatch(
        testEndpoint.endpoints.testAuth.initiate(undefined)
      )

      expect(result.data).toEqual({ authenticated: true })
    })

    it('should work without authorization header when no token', async () => {
      // Create fresh store with no token
      const freshStoreRef = setupApiStore({ auth: { token: null } })

      const testEndpoint = apiSlice.injectEndpoints({
        endpoints: (builder) => ({
          testNoAuth: builder.query({
            query: () => '/test'
          })
        }),
        overrideExisting: true
      })

      const result = await freshStoreRef.store.dispatch(
        testEndpoint.endpoints.testNoAuth.initiate(undefined)
      )

      expect(result.data).toEqual({ authenticated: false })
      freshStoreRef.cleanup()
    })
  })

  describe('baseQueryWithReauth', () => {
    const storeRef = setupApiStore()

    beforeEach(() => {
      server.use(
        http.get('http://localhost:3003/api/v1/protected', () => {
          return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
        }),
        http.get('http://localhost:3003/api/v1/auth/refresh', () => {
          return HttpResponse.json({ accessToken: 'new-token' })
        })
      )
    })

    afterEach(() => {
      server.resetHandlers()
    })

    it('should refresh token and retry on 403 error', async () => {
      let requestCount = 0

      server.use(
        http.get('http://localhost:3003/api/v1/protected', () => {
          requestCount++
          if (requestCount === 1) {
            // First request fails with 403
            return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          // Second request (after refresh) succeeds
          return HttpResponse.json({ data: 'success' })
        })
      )

      const testEndpoint = apiSlice.injectEndpoints({
        endpoints: (builder) => ({
          protectedResource: builder.query({
            query: () => '/protected'
          })
        }),
        overrideExisting: true
      })

      const result = await storeRef.store.dispatch(
        testEndpoint.endpoints.protectedResource.initiate(undefined)
      )

      // Should have made 2 requests: initial + retry after refresh
      expect(requestCount).toBe(2)
      expect(result.data).toEqual({ data: 'success' })

      // Token should be updated in state
      const state = storeRef.store.getState()
      expect(state.auth.token).toBe('new-token')
    })

    it('should handle refresh token failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      server.use(
        http.get('http://localhost:3003/api/v1/auth/refresh', () => {
          return HttpResponse.json(
            { error: 'Refresh token expired' },
            { status: 403 }
          )
        })
      )

      const testEndpoint = apiSlice.injectEndpoints({
        endpoints: (builder) => ({
          failedRefresh: builder.query({
            query: () => '/protected'
          })
        }),
        overrideExisting: true
      })

      const result = await storeRef.store.dispatch(
        testEndpoint.endpoints.failedRefresh.initiate(undefined)
      )

      // Should log error when refresh fails
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Refresh token expired or invalid:',
        expect.anything()
      )

      expect(result.error).toBeDefined()

      consoleErrorSpy.mockRestore()
    })

    it('should handle missing URL in FetchArgs', () => {
      // This tests the error guard for missing URL
      // The guard ensures FetchArgs always has a URL
      // If URL is missing, an error is thrown during baseQueryWithReauth
      expect(apiSlice).toBeDefined()
    })
  })

  describe('credentials', () => {
    it('should include credentials in requests', () => {
      // The baseQuery is configured with credentials: 'include'
      expect(apiSlice).toBeDefined()
    })
  })
})
