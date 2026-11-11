import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupStore } from 'app/store'
import { setCredentials } from 'slices/authSlice'
import { axiosInstance } from '../axios'
import { getWithFreshToken } from '../getWithFreshToken'

vi.mock('../axios', () => ({
  axiosInstance: { get: vi.fn() },
  isAxiosError: (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError)
}))
vi.mock('utils/logger', () => ({ logger: { error: vi.fn() } }))

const mockGet = vi.mocked(axiosInstance.get)
const forbidden = { isAxiosError: true, response: { status: 403 } }
const ok = { data: 'PDB' }

const storeWithToken = (token?: string) => {
  const store = setupStore()
  if (token) store.dispatch(setCredentials({ accessToken: token }))
  return store
}

const stubRefresh = (accessToken?: string) => {
  const fetchMock = vi.fn(async () =>
    accessToken
      ? { ok: true, json: async () => ({ accessToken }) }
      : { ok: false, json: async () => ({}) }
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getWithFreshToken', () => {
  it('sends the current access token with the request config', async () => {
    mockGet.mockResolvedValue(ok)

    const res = await getWithFreshToken(storeWithToken('tkn'), 'a.pdb', {
      responseType: 'text'
    })

    expect(res).toBe(ok)
    expect(mockGet).toHaveBeenCalledWith('a.pdb', {
      responseType: 'text',
      headers: { Authorization: 'Bearer tkn' }
    })
  })

  it('reads the token at request time, not when the store was handed in', async () => {
    mockGet.mockResolvedValue(ok)
    const store = storeWithToken('old')
    store.dispatch(setCredentials({ accessToken: 'new' }))

    await getWithFreshToken(store, 'a.pdb')

    expect(mockGet).toHaveBeenCalledWith('a.pdb', {
      headers: { Authorization: 'Bearer new' }
    })
  })

  it('refreshes an expired token on a 403 and retries once with the new one', async () => {
    mockGet.mockRejectedValueOnce(forbidden).mockResolvedValueOnce(ok)
    const fetchMock = stubRefresh('fresh')
    const store = storeWithToken('stale')

    const res = await getWithFreshToken(store, 'a.pdb')

    expect(res).toBe(ok)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { credentials: 'include' }
    )
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenLastCalledWith('a.pdb', {
      headers: { Authorization: 'Bearer fresh' }
    })
    expect(store.getState().auth.token).toBe('fresh')
  })

  it('throws the 403 when the session cannot be refreshed', async () => {
    mockGet.mockRejectedValue(forbidden)
    stubRefresh()

    await expect(
      getWithFreshToken(storeWithToken('stale'), 'a.pdb')
    ).rejects.toBe(forbidden)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for other errors', async () => {
    const notFound = { isAxiosError: true, response: { status: 404 } }
    mockGet.mockRejectedValue(notFound)
    const fetchMock = stubRefresh('fresh')

    await expect(
      getWithFreshToken(storeWithToken('tkn'), 'a.pdb')
    ).rejects.toBe(notFound)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends no Authorization header without a token', async () => {
    mockGet.mockResolvedValue(ok)

    await getWithFreshToken(storeWithToken(), 'a.pdb', { responseType: 'text' })

    expect(mockGet).toHaveBeenCalledWith('a.pdb', {
      responseType: 'text',
      headers: undefined
    })
  })
})
