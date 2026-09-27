import { jobEventOwnerId } from '@bilbomd/bilbomd-types'
import { redis } from '../queues/redisConn.js'
import { publishJobEvent } from './jobEvents.js'

// Tells connected browsers a job was just submitted, so job lists (the
// owner's, and every Admin's and Manager's) pick it up without waiting for
// their next poll. Never throws; see publishJobEvent.
export const announceNewJob = (job: { _id: unknown; user?: unknown }) =>
  publishJobEvent(redis, {
    jobId: String(job._id),
    ownerId: jobEventOwnerId(job.user),
    kind: 'created'
  })
