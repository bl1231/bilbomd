import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postMock, isAxiosErrorMock, signMock, readFileMock } = vi.hoisted(
  () => ({
    postMock: vi.fn(),
    isAxiosErrorMock: vi.fn(),
    signMock: vi.fn(),
    readFileMock: vi.fn()
  })
)

vi.mock('axios', () => ({
  default: { post: postMock, isAxiosError: isAxiosErrorMock }
}))

vi.mock('jsonwebtoken', () => ({
  default: { sign: signMock }
}))

vi.mock('fs', () => ({
  default: { readFileSync: readFileMock }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

// Re-import the module fresh so the module-level token cache starts empty.
const loadModule = async () => {
  vi.resetModules()
  return import('../nersc-api-token-functions.js')
}

describe('nersc-api-token-functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readFileMock.mockReturnValue('PRIVATE_KEY')
    signMock.mockReturnValue('CLIENT_ASSERTION')
    isAxiosErrorMock.mockReturnValue(false)
  })

  describe('ensureValidToken', () => {
    it('generates an assertion and fetches a new token on first call', async () => {
      postMock.mockResolvedValue({
        data: { access_token: 'TOKEN_1', expires_in: 3600, scope: 'sf-api' }
      })
      const { ensureValidToken } = await loadModule()

      const token = await ensureValidToken()

      expect(token).toBe('TOKEN_1')
      expect(readFileMock).toHaveBeenCalledWith('/secrets/priv_key.pem', 'utf8')
      expect(signMock).toHaveBeenCalledWith(
        expect.objectContaining({ aud: 'https://oidc.nersc.gov/c2id/token' }),
        'PRIVATE_KEY',
        { algorithm: 'RS256' }
      )
      expect(postMock).toHaveBeenCalledTimes(1)
      expect(postMock).toHaveBeenCalledWith(
        'https://oidc.nersc.gov/c2id/token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      )
    })

    it('returns the cached token on subsequent calls without refetching', async () => {
      postMock.mockResolvedValue({
        data: { access_token: 'TOKEN_1', expires_in: 3600, scope: 'sf-api' }
      })
      const { ensureValidToken } = await loadModule()

      const first = await ensureValidToken()
      const second = await ensureValidToken()

      expect(first).toBe('TOKEN_1')
      expect(second).toBe('TOKEN_1')
      expect(postMock).toHaveBeenCalledTimes(1)
    })

    it('refetches when forceRefresh is true even if a token is cached', async () => {
      postMock
        .mockResolvedValueOnce({
          data: { access_token: 'TOKEN_1', expires_in: 3600, scope: 'sf-api' }
        })
        .mockResolvedValueOnce({
          data: { access_token: 'TOKEN_2', expires_in: 3600, scope: 'sf-api' }
        })
      const { ensureValidToken } = await loadModule()

      await ensureValidToken()
      const refreshed = await ensureValidToken(true)

      expect(refreshed).toBe('TOKEN_2')
      expect(postMock).toHaveBeenCalledTimes(2)
    })

    it('refetches when the cached token has expired', async () => {
      // expires_in of 5s minus the 10s skew puts expiry in the past, so the
      // next call must refetch.
      postMock
        .mockResolvedValueOnce({
          data: { access_token: 'TOKEN_1', expires_in: 5, scope: 'sf-api' }
        })
        .mockResolvedValueOnce({
          data: { access_token: 'TOKEN_2', expires_in: 3600, scope: 'sf-api' }
        })
      const { ensureValidToken } = await loadModule()

      await ensureValidToken()
      const second = await ensureValidToken()

      expect(second).toBe('TOKEN_2')
      expect(postMock).toHaveBeenCalledTimes(2)
    })

    it('throws AuthenticationFailed on a 401 response', async () => {
      postMock.mockRejectedValue({ response: { status: 401 } })
      isAxiosErrorMock.mockReturnValue(true)
      const { ensureValidToken } = await loadModule()

      await expect(ensureValidToken()).rejects.toThrow('AuthenticationFailed')
    })

    it('rethrows non-auth errors', async () => {
      postMock.mockRejectedValue(new Error('network down'))
      isAxiosErrorMock.mockReturnValue(false)
      const { ensureValidToken } = await loadModule()

      await expect(ensureValidToken()).rejects.toThrow('network down')
    })
  })
})
