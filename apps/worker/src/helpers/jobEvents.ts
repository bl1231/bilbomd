import {
  JOB_EVENTS_CHANNEL,
  jobEventOwnerId,
  type JobEvent,
  type JobEventKind
} from '@bilbomd/bilbomd-types'
import { logger } from './loggers.js'
import { getErrorMessage } from './errors.js'

// Tells the backend (and through it, the browser) that a job changed, over
// Redis pub/sub. See JOB_EVENTS_CHANNEL in @bilbomd/bilbomd-types.
//
// Publishing is a no-op until configureJobEvents() is called at worker
// startup, so modules that notify can be imported (and unit tested) without
// a Redis connection. Notifying never throws: a lost event only means the UI
// catches up on its next fallback poll.

interface Publisher {
  publish: (channel: string, message: string) => Promise<unknown>
}

// A job's owner is stored as an ObjectId ref (MultiJob), an embedded
// { _id } object, or a populated user document
interface NotifiableJob {
  _id: unknown
  user?: unknown
}

// Most updates for one job within this window are coalesced into one event
// sent at the end of it, so a burst (e.g. step status + progress) costs the
// UI one refetch
const DEFAULT_THROTTLE_MS = 1000

let publisher: Publisher | null = null
let throttleMs = DEFAULT_THROTTLE_MS
// jobs with a throttle window open, and whether they changed again in it
const windows = new Map<
  string,
  { timer: NodeJS.Timeout; pending: JobEvent | null }
>()

const send = (event: JobEvent) => {
  if (!publisher) return
  publisher
    .publish(JOB_EVENTS_CHANNEL, JSON.stringify(event))
    .catch((error) =>
      logger.warn(
        `Failed to publish job event for ${event.jobId}: ${getErrorMessage(error)}`
      )
    )
}

const openWindow = (jobId: string) => {
  const timer = setTimeout(() => {
    const pending = windows.get(jobId)?.pending
    windows.delete(jobId)
    if (pending) {
      send(pending)
      openWindow(jobId)
    }
  }, throttleMs)
  // Don't keep the process alive just to flush an event
  timer.unref()
  windows.set(jobId, { timer, pending: null })
}

export const configureJobEvents = (
  p: Publisher | null,
  options: { throttleMs?: number } = {}
): void => {
  for (const { timer } of windows.values()) clearTimeout(timer)
  windows.clear()
  publisher = p
  throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
}

export const notifyJobChanged = (
  job: NotifiableJob,
  kind: JobEventKind = 'updated'
): void => {
  if (!publisher) return
  const event: JobEvent = {
    jobId: String(job._id),
    ownerId: jobEventOwnerId(job.user),
    kind
  }

  const window = windows.get(event.jobId)
  if (window) {
    window.pending = event
    return
  }
  send(event)
  openWindow(event.jobId)
}
