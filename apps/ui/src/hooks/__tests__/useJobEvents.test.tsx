import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import { apiSlice } from 'app/api/apiSlice'
import { setupApiStore } from '../../test/testUtils'
import {
  INVALIDATE_BATCH_MS,
  createInvalidationBatcher,
  reconnectDelay,
  useJobEvents
} from '../useJobEvents'
import { selectPendingDeletes } from 'slices/jobEventsSlice'
import type { RootState } from 'app/store'

vi.mock('utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

// A response body the test writes to, like the backend's SSE stream
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
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close()
  }
}

const jobEvent = (event: object) =>
  `event: job\ndata: ${JSON.stringify(event)}\n\n`

type Stream = ReturnType<typeof makeStream>

let streams: Stream[]
let fetchMock: ReturnType<typeof vi.fn>
let invalidateSpy: ReturnType<typeof vi.spyOn>

const eventsCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/jobs/events'))

// The i-th stream the hook opened, and the fetch init it was opened with
const stream = (i = 0): Stream => {
  const s = streams[i]
  if (!s) throw new Error(`stream ${i} was never opened`)
  return s
}
const eventsInit = (i = 0) => {
  const call = eventsCalls()[i]
  if (!call) throw new Error(`fetch ${i} to /jobs/events never happened`)
  return call[1]
}

const setup = (preloaded: Partial<RootState> = {}) => {
  const { store } = setupApiStore(preloaded)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const hook = renderHook(() => useJobEvents(), { wrapper })
  return { store, ...hook }
}

// Let pending fetch/stream promises settle
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => {
  vi.useFakeTimers()
  streams = []
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/jobs/events')) {
      const stream = makeStream()
      streams.push(stream)
      return { ok: true, status: 200, body: stream.body }
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  invalidateSpy = vi.spyOn(apiSlice.util, 'invalidateTags')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  invalidateSpy.mockRestore()
})

describe('useJobEvents', () => {
  it('connects with the access token and reports the stream as up', async () => {
    const { store } = setup()
    await flush()

    expect(eventsCalls()[0]?.[0]).toBe(
      'http://localhost:3003/api/v1/jobs/events'
    )
    expect(eventsInit().headers.Authorization).toBe('Bearer test-token')
    expect(store.getState().jobEvents.connected).toBe(true)
  })

  it('does nothing without a token', async () => {
    setup({ auth: { token: null } })
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalidates changed jobs in one batch', async () => {
    setup()
    await flush()

    stream().send(jobEvent({ jobId: 'j1', kind: 'updated' }))
    stream().send(jobEvent({ jobId: 'j2', kind: 'updated' }))
    stream().send(jobEvent({ jobId: 'j1', kind: 'updated' }))
    await flush()
    expect(invalidateSpy).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(INVALIDATE_BATCH_MS))

    expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith([
      { type: 'Job', id: 'j1' },
      { type: 'Job', id: 'j2' }
    ])
  })

  it('invalidates a deleted job so the list drops it', async () => {
    setup()
    await flush()

    stream().send(jobEvent({ jobId: 'j1', kind: 'deleted' }))
    await act(() => vi.advanceTimersByTimeAsync(INVALIDATE_BATCH_MS))

    expect(invalidateSpy).toHaveBeenCalledWith([{ type: 'Job', id: 'j1' }])
  })

  it('stops showing a job as deleting when its deletion failed', async () => {
    const { store } = setup({
      jobEvents: { connected: false, pendingDeletes: ['j1', 'j2'] }
    })
    await flush()

    stream().send(jobEvent({ jobId: 'j1', kind: 'delete_failed' }))
    await flush()

    expect(selectPendingDeletes(store.getState())).toEqual(['j2'])
  })

  it('ignores other events and malformed data', async () => {
    setup()
    await flush()

    stream().send('event: other\ndata: {"jobId":"j1"}\n\n')
    stream().send('event: job\ndata: not json\n\n')
    await act(() => vi.advanceTimersByTimeAsync(INVALIDATE_BATCH_MS))

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('falls back to polling, reconnects, and catches up when the stream ends', async () => {
    const { store } = setup()
    await flush()

    stream().end()
    await flush()
    expect(store.getState().jobEvents.connected).toBe(false)

    await act(() => vi.advanceTimersByTimeAsync(reconnectDelay(0)))

    expect(eventsCalls()).toHaveLength(2)
    expect(store.getState().jobEvents.connected).toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith([{ type: 'Job', id: 'LIST' }])
  })

  it('refreshes the token on 403 and reconnects with the new one', async () => {
    let first = true
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        return { ok: true, json: async () => ({ accessToken: 'new-token' }) }
      }
      if (first) {
        first = false
        return { ok: false, status: 403, body: null }
      }
      const stream = makeStream()
      streams.push(stream)
      return { ok: true, status: 200, body: stream.body }
    })

    const { store } = setup()
    await flush()
    await flush()

    expect(store.getState().auth.token).toBe('new-token')
    expect(eventsCalls()).toHaveLength(2)
    expect(eventsInit(1).headers.Authorization).toBe('Bearer new-token')
  })

  it('gives up when the token cannot be refreshed', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? { ok: false, status: 403 }
        : { ok: false, status: 403, body: null }
    )

    setup()
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(60_000))

    expect(eventsCalls()).toHaveLength(1)
  })

  it('closes the stream on unmount', async () => {
    const { store, unmount } = setup()
    await flush()

    unmount()

    expect(eventsInit().signal.aborted).toBe(true)
    expect(store.getState().jobEvents.connected).toBe(false)
  })
})

describe('reconnectDelay', () => {
  it('backs off exponentially up to 30s', () => {
    expect([0, 1, 2, 3, 10].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 30_000
    ])
  })
})

describe('createInvalidationBatcher', () => {
  it('drops pending ids when cancelled', () => {
    const flushBatch = vi.fn()
    const batcher = createInvalidationBatcher(flushBatch, 100)

    batcher.add('j1')
    batcher.cancel()
    vi.advanceTimersByTime(100)

    expect(flushBatch).not.toHaveBeenCalled()
  })
})
