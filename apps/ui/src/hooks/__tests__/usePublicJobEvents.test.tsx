import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import { apiSlice } from 'app/api/apiSlice'
import { setupApiStore } from '../../test/testUtils'
import { INVALIDATE_BATCH_MS } from '../useJobEvents'
import { publicTagsForEvent, usePublicJobEvents } from '../usePublicJobEvents'
import { reconnectDelay } from 'utils/jobEventStream'

vi.mock('utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

const makeStream = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    }
  })
  const encoder = new TextEncoder()
  return {
    body,
    send: (text: string) => controller.enqueue(encoder.encode(text))
  }
}
type Stream = ReturnType<typeof makeStream>

const jobEvent = (event: object) =>
  `event: job\ndata: ${JSON.stringify(event)}\n\n`

let streams: Stream[]
let fetchMock: ReturnType<typeof vi.fn>
let invalidateSpy: ReturnType<typeof vi.spyOn>

const stream = (i = 0): Stream => {
  const s = streams[i]
  if (!s) throw new Error(`stream ${i} was never opened`)
  return s
}

const openStream = async () => {
  const s = makeStream()
  streams.push(s)
  return { ok: true, status: 200, body: s.body }
}

// Explicit parameter, no default: a default would swallow an intended
// undefined
const setupWith = (publicId: string | undefined) => {
  const { store } = setupApiStore({ auth: { token: null } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return renderHook(() => usePublicJobEvents(publicId), { wrapper })
}
const setup = () => setupWith('token-abc')

const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => {
  vi.useFakeTimers()
  streams = []
  fetchMock = vi.fn(openStream)
  vi.stubGlobal('fetch', fetchMock)
  invalidateSpy = vi.spyOn(apiSlice.util, 'invalidateTags')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  invalidateSpy.mockRestore()
})

describe('usePublicJobEvents', () => {
  it("connects to the job's public stream without credentials", async () => {
    const { result } = setup()
    await flush()

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'http://localhost:3003/api/v1/public/jobs/token-abc/events'
    )
    expect(init.headers).not.toHaveProperty('Authorization')
    expect(result.current).toBe(true)
  })

  it('does nothing without a public id', async () => {
    const { result } = setupWith(undefined)
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })

  it('refreshes the job and its movies, keyed by the public id', async () => {
    setup()
    await flush()

    stream().send(jobEvent({ jobId: 'mongo-id', kind: 'updated' }))
    stream().send(jobEvent({ jobId: 'mongo-id', kind: 'movies' }))
    await act(() => vi.advanceTimersByTimeAsync(INVALIDATE_BATCH_MS))

    expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith([
      { type: 'PublicJob', id: 'token-abc' },
      { type: 'PublicMovieAsset', id: 'token-abc' }
    ])
  })

  it('stops for good when the job does not exist', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, body: null })

    const { result } = setup()
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(false)
  })

  it('backs off and retries when over the connection cap', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, body: null })
      .mockImplementation(openStream)

    const { result } = setup()
    await flush()
    expect(result.current).toBe(false)

    await act(() => vi.advanceTimersByTimeAsync(reconnectDelay(0)))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toBe(true)
  })

  it('closes the stream on unmount', async () => {
    const { unmount } = setup()
    await flush()

    unmount()

    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
  })
})

describe('publicTagsForEvent', () => {
  it.each([
    ['updated', 'PublicJob'],
    ['deleted', 'PublicJob'],
    ['movies', 'PublicMovieAsset']
  ] as const)("maps '%s' to %s", (kind, type) => {
    expect(publicTagsForEvent({ jobId: 'mongo-id', kind }, 'tok')).toEqual([
      { type, id: 'tok' }
    ])
  })
})
