import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import { setupStore } from 'app/store'
import { setCredentials } from 'slices/authSlice'
import { axiosInstance } from 'app/api/axios'
import {
  filenameFromContentDisposition,
  resultsUrl,
  useJobDownload
} from '../useJobDownload'

vi.mock('app/api/axios', () => ({
  axiosInstance: { get: vi.fn() },
  isAxiosError: (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError)
}))
vi.mock('utils/logger', () => ({ logger: { error: vi.fn() } }))

const mockGet = vi.mocked(axiosInstance.get)

const makeWrapper = (token?: string) => {
  const store = setupStore()
  if (token) store.dispatch(setCredentials({ accessToken: token }))
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return Wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  window.URL.createObjectURL = vi.fn(() => 'blob:x')
  window.URL.revokeObjectURL = vi.fn()
})

describe('download helpers', () => {
  it('builds the results URL for each source', () => {
    expect(resultsUrl({ kind: 'owner', id: 'job-1' })).toBe(
      'jobs/job-1/results'
    )
    expect(resultsUrl({ kind: 'public', token: 'tok' })).toBe(
      '/public/jobs/tok/results'
    )
  })

  it('reads the filename from Content-Disposition, with a default', () => {
    expect(
      filenameFromContentDisposition('attachment; filename="abc.tar.gz"')
    ).toBe('abc.tar.gz')
    expect(filenameFromContentDisposition('attachment; filename=x.tgz')).toBe(
      'x.tgz'
    )
    expect(filenameFromContentDisposition(undefined)).toBe('results.tar.gz')
  })
})

const forbidden = { isAxiosError: true, response: { status: 403 } }
const blobResponse = {
  data: new Blob(['x']),
  headers: { 'content-disposition': 'attachment; filename="r.tar.gz"' }
}

describe('useJobDownload', () => {
  it('refreshes an expired access token and retries the download once', async () => {
    mockGet.mockRejectedValueOnce(forbidden).mockResolvedValueOnce(blobResponse)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ accessToken: 'fresh' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { result } = renderHook(
      () => useJobDownload({ kind: 'owner', id: 'job-1' }),
      { wrapper: makeWrapper('stale') }
    )
    await act(() => result.current.download())

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { credentials: 'include' }
    )
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenLastCalledWith('jobs/job-1/results', {
      responseType: 'blob',
      headers: { Authorization: 'Bearer fresh' }
    })
    expect(result.current.error).toBeNull()
    vi.unstubAllGlobals()
  })

  it('reports the failure when the session cannot be refreshed', async () => {
    mockGet.mockRejectedValue(forbidden)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )

    const { result } = renderHook(
      () => useJobDownload({ kind: 'owner', id: 'job-1' }),
      { wrapper: makeWrapper('stale') }
    )
    await act(() => result.current.download())

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result.current.error).toMatch(/Download failed/)
    vi.unstubAllGlobals()
  })

  it('does not try to refresh for a public download', async () => {
    mockGet.mockRejectedValue(forbidden)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(
      () => useJobDownload({ kind: 'public', token: 'tok' }),
      { wrapper: makeWrapper() }
    )
    await act(() => result.current.download())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/Download failed/)
    vi.unstubAllGlobals()
  })

  it('sends the access token for owner downloads and saves the file', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-disposition': 'attachment; filename="r.tar.gz"' }
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const { result } = renderHook(
      () => useJobDownload({ kind: 'owner', id: 'job-1' }),
      { wrapper: makeWrapper('tkn') }
    )
    await act(() => result.current.download())

    expect(mockGet).toHaveBeenCalledWith('jobs/job-1/results', {
      responseType: 'blob',
      headers: { Authorization: 'Bearer tkn' }
    })
    expect(click).toHaveBeenCalled()
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    expect(result.current.error).toBeNull()
    expect(result.current.isDownloading).toBe(false)
  })

  it('sends no auth header for public downloads', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['x']), headers: {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { result } = renderHook(
      () => useJobDownload({ kind: 'public', token: 'tok' }),
      { wrapper: makeWrapper('tkn') }
    )
    await act(() => result.current.download())

    expect(mockGet).toHaveBeenCalledWith('/public/jobs/tok/results', {
      responseType: 'blob',
      headers: undefined
    })
  })

  it('reports an error when the request fails, and can clear it', async () => {
    mockGet.mockRejectedValue(new Error('500'))

    const { result } = renderHook(
      () => useJobDownload({ kind: 'public', token: 'tok' }),
      { wrapper: makeWrapper() }
    )
    await act(() => result.current.download())

    expect(result.current.error).toMatch(/Download failed/)
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
