import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createJobEventNotifier,
  JOB_EVENTS_CHANNEL
} from '../jobs/jobEvents.js'

const events = (publish: ReturnType<typeof vi.fn>) =>
  publish.mock.calls.map(([channel, message]) => {
    expect(channel).toBe(JOB_EVENTS_CHANNEL)
    return JSON.parse(message as string) as { jobId: string; kind: string }
  })

describe('createJobEventNotifier', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('publishes the first change at once and coalesces the rest', async () => {
    const publish = vi.fn(async () => 1)
    const notifier = createJobEventNotifier({ publish, throttleMs: 1000 })

    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'a' }, 'deleted')
    expect(events(publish)).toEqual([{ jobId: 'a', kind: 'updated' }])

    await vi.advanceTimersByTimeAsync(1000)
    expect(events(publish).map((e) => e.kind)).toEqual(['updated', 'deleted'])
    notifier.close()
  })

  it('flush publishes held-back changes without waiting for the window', async () => {
    const publish = vi.fn(async () => 1)
    const notifier = createJobEventNotifier({ publish, throttleMs: 1000 })

    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'a' }, 'deleted')
    notifier.notify({ _id: 'b' })
    await notifier.flush()

    expect(events(publish)).toEqual([
      { jobId: 'a', kind: 'updated' },
      { jobId: 'b', kind: 'updated' },
      { jobId: 'a', kind: 'deleted' }
    ])
    // Nothing is left to publish when the windows would have ended
    await vi.advanceTimersByTimeAsync(5000)
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('flush waits for the publishes and reports their errors', async () => {
    let releaseA: () => void = () => {}
    let held = 0
    // The first event per job goes out at once; the flushed ones are held
    // (job a) or fail (job b)
    const publish = vi.fn(async (_channel: string, message: string) => {
      const { jobId } = JSON.parse(message) as { jobId: string }
      if (held++ < 2) return 1
      if (jobId === 'a') {
        await new Promise<void>((resolve) => (releaseA = resolve))
        return 1
      }
      throw new Error('redis down')
    })
    const onError = vi.fn()
    const notifier = createJobEventNotifier({ publish, onError })

    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'b' })
    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'b' })

    let flushed = false
    const flushing = notifier.flush().then(() => (flushed = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(publish).toHaveBeenCalledTimes(4)
    expect(flushed).toBe(false)

    releaseA()
    await flushing
    expect(flushed).toBe(true)
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'redis down' }),
      expect.objectContaining({ jobId: 'b' })
    )
  })

  it('close drops held-back changes', async () => {
    const publish = vi.fn(async () => 1)
    const notifier = createJobEventNotifier({ publish })

    notifier.notify({ _id: 'a' })
    notifier.notify({ _id: 'a' })
    notifier.close()
    await vi.advanceTimersByTimeAsync(5000)

    expect(publish).toHaveBeenCalledTimes(1)
  })
})
