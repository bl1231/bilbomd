// Redis pub/sub channel for "this job changed" notifications. Workers (and
// the backend's own delete worker) publish; the backend subscribes and
// forwards each event over Server-Sent Events to the browsers allowed to see
// the job. Events only say *which* job changed. Clients refetch the job
// through the normal REST endpoints, so access checks and DTO shaping stay
// in one place.
export const JOB_EVENTS_CHANNEL = 'bilbomd:job-events'

// updated        status, step or progress changed
// deleted        the job's document has been removed
// delete_failed  deleting the job failed after its final attempt
export type JobEventKind = 'updated' | 'deleted' | 'delete_failed'

export interface JobEvent {
  // MongoDB _id of the Job / MultiJob (the DTO `id` and RTK Query tag id)
  jobId: string
  // MongoDB _id of the owning user; absent for anonymous jobs
  ownerId?: string
  kind: JobEventKind
}

// Name of the SSE `event:` field for job events on the stream
export const JOB_EVENT_SSE_NAME = 'job'

// The owner's id as a string, from however a job stores its user: a plain
// ObjectId ref (MultiJob), an embedded { _id } object (Job), or a populated
// user document. Mongoose ObjectIds stringify to their hex id.
export const jobEventOwnerId = (user: unknown): string | undefined => {
  if (user == null) return undefined
  if (typeof user === 'object' && '_id' in user && user._id != null) {
    return String(user._id)
  }
  return String(user)
}

// Timers exist in every runtime this package is used in (Node and browsers),
// but not in the ES-only lib it compiles against
declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void

export interface JobEventNotifierOptions {
  publish: (channel: string, message: string) => Promise<unknown>
  // Updates for one job within this window are coalesced (default 1000 ms)
  throttleMs?: number
  // Called when publishing fails; a lost event only delays the UI until its
  // next fallback poll, so this never throws
  onError?: (error: unknown, event: JobEvent) => void
}

// Throttled publisher shared by every app that changes jobs (worker, scoper).
// The first change to a job is published at once; further changes within
// throttleMs are coalesced into one event at the end of the window, so a
// burst (e.g. step status + progress) costs the UI one refetch.
export const createJobEventNotifier = ({
  publish,
  throttleMs = 1000,
  onError
}: JobEventNotifierOptions) => {
  // jobs with a window open, and the latest change seen in it, if any
  const windows = new Map<
    string,
    { timer: unknown; pending: JobEvent | null }
  >()

  const send = (event: JobEvent) => {
    publish(JOB_EVENTS_CHANNEL, JSON.stringify(event)).catch((error) =>
      onError?.(error, event)
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
    // In Node, don't keep the process alive just to flush an event
    ;(timer as { unref?: () => void }).unref?.()
    windows.set(jobId, { timer, pending: null })
  }

  return {
    notify: (
      job: { _id: unknown; user?: unknown },
      kind: JobEventKind = 'updated'
    ): void => {
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
    },
    // Drops pending events and timers
    close: (): void => {
      for (const { timer } of windows.values()) clearTimeout(timer)
      windows.clear()
    }
  }
}

export type JobEventNotifier = ReturnType<typeof createJobEventNotifier>
