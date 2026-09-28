import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { JobEvent } from '@bilbomd/bilbomd-types'
import { shareJobEventStream } from '../sharedJobEventStream'

// Simulates several tabs in one test: an in-memory Web Locks manager and a
// BroadcastChannel that delivers asynchronously to every other instance of
// the same name, as browsers do.

class FakeChannel {
  static channels = new Set<FakeChannel>()
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(readonly name: string) {
    FakeChannel.channels.add(this)
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.channels) {
      if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.onmessage?.({ data }))
      }
    }
  }
  close() {
    FakeChannel.channels.delete(this)
  }
}

const makeLocks = () => {
  const held = new Set<string>()
  const waiting = new Map<string, Array<() => void>>()
  const grantNext = (name: string) => {
    const next = waiting.get(name)?.shift()
    if (next) next()
  }
  return {
    request: (
      name: string,
      opts: { signal?: AbortSignal },
      cb: () => Promise<void>
    ) =>
      new Promise<void>((resolve, reject) => {
        const run = () => {
          held.add(name)
          void cb().finally(() => {
            held.delete(name)
            resolve()
            grantNext(name)
          })
        }
        if (!held.has(name)) return run()
        const queue = waiting.get(name) ?? []
        queue.push(run)
        waiting.set(name, queue)
        opts.signal?.addEventListener('abort', () => {
          const i = queue.indexOf(run)
          if (i >= 0) queue.splice(i, 1)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
  }
}

// A tab: records what reaches it, and exposes its stream (if it leads) so
// the test can push events and connection changes through it
const makeTab = (name = 'bilbomd-job-events:alice') => {
  const controller = new AbortController()
  const tab = {
    events: [] as JobEvent[],
    connections: [] as Array<[boolean, boolean]>,
    opened: 0,
    stream: null as null | {
      emit: (e: JobEvent) => void
      connect: (connected: boolean, resumed?: boolean) => void
      stop: () => void
    },
    close: () => controller.abort()
  }
  shareJobEventStream({
    name,
    signal: controller.signal,
    onEvent: (e) => tab.events.push(e),
    onConnection: (c, r) => tab.connections.push([c, r]),
    open: (signal, onEvent, onConnection) =>
      new Promise<void>((resolve) => {
        tab.opened++
        const stop = () => {
          tab.stream = null
          resolve()
        }
        tab.stream = {
          emit: onEvent,
          connect: (c, r = false) => onConnection(c, r),
          stop
        }
        signal.addEventListener('abort', stop, { once: true })
      })
  })
  return tab
}

const settle = () => new Promise((r) => setTimeout(r, 0))
const event = (jobId: string): JobEvent => ({ jobId, kind: 'updated' })

beforeEach(() => {
  FakeChannel.channels.clear()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  Object.defineProperty(navigator, 'locks', {
    value: makeLocks(),
    configurable: true
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'locks', {
    value: undefined,
    configurable: true
  })
})

describe('shareJobEventStream', () => {
  it('opens one stream for all tabs and gives every tab its events', async () => {
    const a = makeTab()
    const b = makeTab()
    const c = makeTab()
    await settle()

    expect(a.opened + b.opened + c.opened).toBe(1)
    const leader = [a, b, c].find((t) => t.stream)!
    leader.stream!.emit(event('j1'))
    await settle()

    for (const tab of [a, b, c]) expect(tab.events).toEqual([event('j1')])
  })

  it('tells the other tabs whether the stream is connected', async () => {
    const a = makeTab()
    const b = makeTab()
    await settle()

    a.stream!.connect(true)
    await settle()

    expect(b.connections).toEqual([[true, false]])
  })

  it('brings a tab opened later up to date', async () => {
    const a = makeTab()
    await settle()
    a.stream!.connect(true)

    const late = makeTab()
    await settle()

    expect(late.opened).toBe(0)
    expect(late.connections).toEqual([[true, false]])
  })

  it('hands over when the leading tab closes, and catches up', async () => {
    const a = makeTab()
    const b = makeTab()
    await settle()
    a.stream!.connect(true)
    await settle()

    a.close()
    await settle()

    // b hears the stream went down, then takes over and opens its own
    expect(b.connections).toEqual([
      [true, false],
      [false, false]
    ])
    expect(b.opened).toBe(1)

    // its first connection counts as resumed: events may have been missed
    b.stream!.connect(true)
    expect(b.connections.at(-1)).toEqual([true, true])
  })

  it('does not open a stream for a tab closed while waiting', async () => {
    const a = makeTab()
    const b = makeTab()
    await settle()

    b.close()
    a.close()
    await settle()

    expect(b.opened).toBe(0)
  })

  it('keeps separate streams for different names', async () => {
    const alice = makeTab('bilbomd-job-events:alice')
    const job = makeTab('bilbomd-public-job-events:tok')
    await settle()

    expect(alice.opened).toBe(1)
    expect(job.opened).toBe(1)
    alice.stream!.emit(event('j1'))
    await settle()
    expect(job.events).toEqual([])
  })

  it('falls back to a stream per tab without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true
    })
    const a = makeTab()
    const b = makeTab()
    await settle()

    expect(a.opened).toBe(1)
    expect(b.opened).toBe(1)
  })
})
