import {
  createJobEventNotifier,
  type JobEventKind,
  type JobEventNotifier
} from '@bilbomd/bilbomd-types'
import { logger } from './loggers.js'
import { getErrorMessage } from './errors.js'

// Tells the backend (and through it, the browser) that a job changed, over
// Redis pub/sub. See JOB_EVENTS_CHANNEL and createJobEventNotifier in
// @bilbomd/bilbomd-types.
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

let notifier: JobEventNotifier | null = null

export const configureJobEvents = (
  publisher: Publisher | null,
  options: { throttleMs?: number } = {}
): void => {
  notifier?.close()
  notifier = publisher
    ? createJobEventNotifier({
        publish: (channel, message) => publisher.publish(channel, message),
        throttleMs: options.throttleMs,
        onError: (error, event) =>
          logger.warn(
            `Failed to publish job event for ${event.jobId}: ${getErrorMessage(error)}`
          )
      })
    : null
}

export const notifyJobChanged = (
  job: NotifiableJob,
  kind: JobEventKind = 'updated'
): void => {
  notifier?.notify(job, kind)
}

// What the UI shows about a job; a change in any of these is worth an event
interface WatchableJob extends NotifiableJob {
  status?: unknown
  progress?: unknown
  steps?: unknown
  results_ready?: unknown
  cleanup_in_progress?: unknown
  nersc?: { state?: unknown } | null
}

// Each step's status and message. Other fields are left out: rewriting a
// step, as the NERSC monitor does on every pass, gives it a new _id even when
// nothing changed.
const stepSummary = (steps: unknown) => {
  if (!steps || typeof steps !== 'object') return null
  const plain = JSON.parse(JSON.stringify(steps)) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(plain).map(([name, step]) => {
      const s = (step ?? {}) as { status?: unknown; message?: unknown }
      return [name, { status: s.status, message: s.message }]
    })
  )
}

const visibleState = (job: WatchableJob): string =>
  JSON.stringify({
    status: job.status,
    progress: job.progress,
    steps: stepSummary(job.steps),
    results_ready: job.results_ready,
    cleanup: job.cleanup_in_progress,
    nersc: job.nersc?.state
  })

// For code that updates many jobs through scattered writes (e.g. the NERSC
// job monitor): snapshot the jobs' visible state now, and call the returned
// function afterwards to notify for each job that changed. Jobs that didn't
// change produce no event, so periodic passes don't make the UI refetch.
export const watchJobsForChanges = (jobs: WatchableJob[]): (() => void) => {
  const before = jobs.map(visibleState)
  return () => {
    jobs.forEach((job, i) => {
      if (visibleState(job) !== before[i]) notifyJobChanged(job)
    })
  }
}
