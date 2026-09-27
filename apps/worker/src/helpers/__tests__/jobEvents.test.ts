import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Types } from 'mongoose'
import { JOB_EVENTS_CHANNEL } from '@bilbomd/bilbomd-types'

vi.mock('../loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  configureJobEvents,
  notifyJobChanged,
  watchJobsForChanges
} from '../jobEvents.js'
import { logger } from '../loggers.js'

const publish = vi.fn()

const sent = () =>
  publish.mock.calls.map(([channel, message]) => {
    expect(channel).toBe(JOB_EVENTS_CHANNEL)
    return JSON.parse(message)
  })

const ownerId = new Types.ObjectId()
const job = (id = 'job-1', user: unknown = { _id: ownerId }) => ({
  _id: id,
  user
})

beforeEach(() => {
  vi.useFakeTimers()
  publish.mockReset().mockResolvedValue(1)
  configureJobEvents({ publish }, { throttleMs: 1000 })
})

afterEach(() => {
  configureJobEvents(null)
  vi.useRealTimers()
})

describe('notifyJobChanged', () => {
  it('publishes the job id, owner and kind', () => {
    notifyJobChanged(job())

    expect(sent()).toEqual([
      { jobId: 'job-1', ownerId: ownerId.toString(), kind: 'updated' }
    ])
  })

  it.each([
    ['an ObjectId ref', ownerId],
    ['an embedded { _id }', { _id: ownerId }],
    ['a populated user', { _id: ownerId, username: 'u' }]
  ])('reads the owner from %s', (_, user) => {
    notifyJobChanged(job('job-1', user))

    expect(sent()[0].ownerId).toBe(ownerId.toString())
  })

  it('omits the owner for anonymous jobs', () => {
    notifyJobChanged(job('job-1', null))

    expect(sent()[0]).not.toHaveProperty('ownerId')
  })

  it('coalesces a burst for one job into a leading and a trailing event', () => {
    notifyJobChanged(job())
    notifyJobChanged(job())
    notifyJobChanged(job())
    expect(publish).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(publish).toHaveBeenCalledTimes(2)

    // nothing new in the next window, so nothing more is sent
    vi.advanceTimersByTime(5000)
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('sends the latest kind at the end of the window', () => {
    notifyJobChanged(job())
    notifyJobChanged(job(), 'deleted')

    vi.advanceTimersByTime(1000)

    expect(sent().map((e) => e.kind)).toEqual(['updated', 'deleted'])
  })

  it('throttles each job separately', () => {
    notifyJobChanged(job('job-1'))
    notifyJobChanged(job('job-2'))

    expect(sent().map((e) => e.jobId)).toEqual(['job-1', 'job-2'])
  })

  it('sends immediately again once a quiet window has passed', () => {
    notifyJobChanged(job())
    vi.advanceTimersByTime(1000)
    notifyJobChanged(job())

    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('does nothing until a publisher is configured', () => {
    configureJobEvents(null)

    notifyJobChanged(job())

    expect(publish).not.toHaveBeenCalled()
  })

  it('logs and swallows publish failures', async () => {
    publish.mockRejectedValue(new Error('redis down'))

    expect(() => notifyJobChanged(job())).not.toThrow()
    await vi.runAllTimersAsync()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('redis down')
    )
  })
})

describe('watchJobsForChanges', () => {
  const watched = (id: string) => ({
    _id: id,
    user: { _id: ownerId },
    status: 'Running',
    progress: 10,
    steps: { md: { status: 'Running' } },
    nersc: { state: 'RUNNING' }
  })

  it('notifies only for jobs whose visible state changed', () => {
    const a = watched('job-a')
    const b = watched('job-b')
    const notifyChanged = watchJobsForChanges([a, b])

    a.progress = 50

    notifyChanged()
    expect(sent().map((e) => e.jobId)).toEqual(['job-a'])
  })

  it.each([
    ['status', (j: ReturnType<typeof watched>) => (j.status = 'Completed')],
    [
      'a step',
      (j: ReturnType<typeof watched>) => (j.steps.md.status = 'Success')
    ],
    [
      'the NERSC state',
      (j: ReturnType<typeof watched>) => (j.nersc.state = 'COMPLETED')
    ]
  ])('treats a change to %s as a change', (_, mutate) => {
    const job = watched('job-a')
    const notifyChanged = watchJobsForChanges([job])

    mutate(job)
    notifyChanged()

    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when nothing changed', () => {
    const notifyChanged = watchJobsForChanges([watched('job-a')])

    notifyChanged()

    expect(publish).not.toHaveBeenCalled()
  })
})
