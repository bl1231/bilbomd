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
