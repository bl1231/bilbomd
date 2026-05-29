import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { authApiSlice } from '../authApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockLoginResponse = {
  accessToken: 'mock-access-token',
  user: { id: '1', username: 'testuser', email: 'test@example.com' }
}

const mockRefreshResponse = {
  accessToken: 'new-access-token'
}

const mockOrcidSessionResponse = {
  givenName: 'Test',
  familyName: 'User',
  email: 'test@example.com',
  orcidId: '0000-0000-0000-0000'
}

describe('authApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.post(
        'http://localhost:3003/api/v1/auth/otp',
        async ({ request }) => {
          const _body = await request.json()
          return HttpResponse.json(mockLoginResponse)
        }
      ),
      http.post('http://localhost:3003/api/v1/auth/logout', () => {
        return HttpResponse.json({ success: true })
      }),
      http.get('http://localhost:3003/api/v1/auth/refresh', () => {
        return HttpResponse.json(mockRefreshResponse)
      }),
      http.get('http://localhost:3003/api/v1/auth/orcid/confirmation', () => {
        return HttpResponse.json(mockOrcidSessionResponse)
      }),
      http.post(
        'http://localhost:3003/api/v1/auth/orcid/finalize',
        async ({ request }) => {
          const _body = await request.json()
          return HttpResponse.json({ success: true })
        }
      )
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('login', () => {
    it('should send login request with credentials', async () => {
      const credentials = { email: 'test@example.com', otp: '123456' }

      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.login.initiate(credentials)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle login errors', async () => {
      server.use(
        http.post('http://localhost:3003/api/v1/auth/otp', () => {
          return HttpResponse.json(
            { error: 'Invalid credentials' },
            { status: 401 }
          )
        })
      )

      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.login.initiate({
          email: 'bad@example.com',
          otp: '000000'
        })
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })

  describe('sendLogout', () => {
    it('should send logout request and clear state', async () => {
      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.sendLogout.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle logout errors', async () => {
      server.use(
        http.post('http://localhost:3003/api/v1/auth/logout', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 })
        })
      )

      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.sendLogout.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })

  describe('refresh', () => {
    it('should refresh access token', async () => {
      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.refresh.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle refresh errors', async () => {
      server.use(
        http.get('http://localhost:3003/api/v1/auth/refresh', () => {
          return HttpResponse.json({ error: 'Token expired' }, { status: 401 })
        })
      )

      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.refresh.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })

  describe('getOrcidSession', () => {
    it('should fetch ORCID session information', async () => {
      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.getOrcidSession.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('finalizeOrcid', () => {
    it('should finalize ORCID authentication', async () => {
      // PR 3 of #817 — backend ignores the request body and trusts the
      // server-side session profile, so callers send an empty object.
      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.finalizeOrcid.initiate({})
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle finalize errors', async () => {
      server.use(
        http.post('http://localhost:3003/api/v1/auth/orcid/finalize', () => {
          return HttpResponse.json({ error: 'Invalid code' }, { status: 400 })
        })
      )

      const result = await storeRef.store.dispatch(
        authApiSlice.endpoints.finalizeOrcid.initiate({})
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
    })
  })
})
