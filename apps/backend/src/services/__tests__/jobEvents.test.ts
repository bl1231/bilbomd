import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Redis } from 'ioredis'
import { JOB_EVENTS_CHANNEL, type JobEvent } from '@bilbomd/bilbomd-types'

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  addJobEventClient,
  canSeeJobEvent,
  closeAllJobEventClients,
  dispatchJobEvent,
  jobEventClientCount,
  publishJobEvent,
  startJobEventSubscriber,
  type JobEventClient
} from '../jobEvents.js'
import { logger } from '../../middleware/loggers.js'

const client = (overrides: Partial<JobEventClient> = {}) => ({
  userId: 'user-1',
  privileged: false,
  send: vi.fn(),
  close: vi.fn(),
  ...overrides
})

const event = (overrides: Partial<JobEvent> = {}): JobEvent => ({
  jobId: 'job-1',
  ownerId: 'user-1',
  kind: 'updated',
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  closeAllJobEventClients()
})

describe('canSeeJobEvent', () => {
  it('lets owners see their own jobs', () => {
    expect(canSeeJobEvent(client(), event())).toBe(true)
  })

  it("hides other users' jobs", () => {
    expect(canSeeJobEvent(client(), event({ ownerId: 'user-2' }))).toBe(false)
  })

  it('hides anonymous jobs from regular users', () => {
    expect(canSeeJobEvent(client(), event({ ownerId: undefined }))).toBe(false)
  })

  it('shows a public job page only its own job', () => {
    const page = client({ userId: undefined, jobId: 'job-1' })
    expect(canSeeJobEvent(page, event({ jobId: 'job-1' }))).toBe(true)
    expect(canSeeJobEvent(page, event({ jobId: 'job-2' }))).toBe(false)
    // even when the job has no owner, or the event is for the same owner
    expect(
      canSeeJobEvent(page, event({ jobId: 'job-1', ownerId: undefined }))
    ).toBe(true)
  })

  it('does not widen a public page with privileged set', () => {
    const page = client({ privileged: true, jobId: 'job-1' })
    expect(canSeeJobEvent(page, event({ jobId: 'job-2' }))).toBe(false)
  })

  it('shows every job to privileged users', () => {
    const admin = client({ userId: undefined, privileged: true })
    expect(canSeeJobEvent(admin, event({ ownerId: 'user-2' }))).toBe(true)
    expect(canSeeJobEvent(admin, event({ ownerId: undefined }))).toBe(true)
  })
})

describe('dispatchJobEvent', () => {
  it('sends each event only to clients that may see it', () => {
    const owner = client()
    const other = client({ userId: 'user-2' })
    const admin = client({ userId: undefined, privileged: true })
    addJobEventClient(owner)
    addJobEventClient(other)
    addJobEventClient(admin)

    dispatchJobEvent(JSON.stringify(event()))

    expect(owner.send).toHaveBeenCalledExactlyOnceWith(event())
    expect(other.send).not.toHaveBeenCalled()
    expect(admin.send).toHaveBeenCalledExactlyOnceWith(event())
  })

  it.each(['created', 'movies', 'deleted', 'delete_failed'] as const)(
    "forwards '%s' events",
    (kind) => {
      const owner = client()
      addJobEventClient(owner)

      dispatchJobEvent(JSON.stringify(event({ kind })))

      expect(owner.send).toHaveBeenCalledWith(event({ kind }))
    }
  )

  it('stops sending to removed clients', () => {
    const owner = client()
    const remove = addJobEventClient(owner)
    remove()

    dispatchJobEvent(JSON.stringify(event()))

    expect(owner.send).not.toHaveBeenCalled()
    expect(jobEventClientCount()).toBe(0)
  })

  it('drops unknown fields from the event it forwards', () => {
    const owner = client()
    addJobEventClient(owner)

    dispatchJobEvent(JSON.stringify({ ...event(), secret: 'x' }))

    expect(owner.send).toHaveBeenCalledWith(event())
  })

  it.each([
    ['not JSON', 'nope'],
    ['no jobId', JSON.stringify({ kind: 'updated' })],
    ['an unknown kind', JSON.stringify({ jobId: 'j', kind: 'exploded' })],
    [
      'a non-string owner',
      JSON.stringify({ jobId: 'j', kind: 'updated', ownerId: 7 })
    ]
  ])('ignores a message with %s', (_, raw) => {
    const admin = client({ privileged: true })
    addJobEventClient(admin)

    dispatchJobEvent(raw)

    expect(admin.send).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('keeps delivering to other clients when one fails', () => {
    const broken = client({
      send: vi.fn(() => {
        throw new Error('socket gone')
      })
    })
    const owner = client()
    addJobEventClient(broken)
    addJobEventClient(owner)

    dispatchJobEvent(JSON.stringify(event()))

    expect(owner.send).toHaveBeenCalled()
  })
})

describe('closeAllJobEventClients', () => {
  it('ends and forgets every stream', () => {
    const a = client()
    const b = client()
    addJobEventClient(a)
    addJobEventClient(b)

    closeAllJobEventClients()

    expect(a.close).toHaveBeenCalled()
    expect(b.close).toHaveBeenCalled()
    expect(jobEventClientCount()).toBe(0)
  })
})

describe('startJobEventSubscriber', () => {
  it('dispatches messages from the job events channel only', async () => {
    let onMessage: (channel: string, raw: string) => void = () => {}
    const subscriber = {
      on: vi.fn((_: string, fn: typeof onMessage) => {
        onMessage = fn
      }),
      subscribe: vi.fn().mockResolvedValue(1),
      unsubscribe: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK')
    }
    const owner = client()
    addJobEventClient(owner)

    const stop = await startJobEventSubscriber(subscriber as unknown as Redis)
    onMessage('some-other-channel', JSON.stringify(event()))
    onMessage(JOB_EVENTS_CHANNEL, JSON.stringify(event()))

    expect(subscriber.subscribe).toHaveBeenCalledWith(JOB_EVENTS_CHANNEL)
    expect(owner.send).toHaveBeenCalledTimes(1)

    await stop()
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(JOB_EVENTS_CHANNEL)
    expect(subscriber.quit).toHaveBeenCalled()
  })
})

describe('publishJobEvent', () => {
  it('publishes the event as JSON on the job events channel', async () => {
    const publisher = { publish: vi.fn().mockResolvedValue(1) }

    await publishJobEvent(publisher, event())

    expect(publisher.publish).toHaveBeenCalledWith(
      JOB_EVENTS_CHANNEL,
      JSON.stringify(event())
    )
  })

  it('logs instead of throwing when Redis is unavailable', async () => {
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('down')) }

    await expect(publishJobEvent(publisher, event())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('down'))
  })
})
