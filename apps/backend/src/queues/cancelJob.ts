import type { JobType, Queue } from 'bullmq'
import {
  JOB_CANCEL_CHANNEL,
  type JobCancelMessage
} from '@bilbomd/bilbomd-types'
import { logger } from '../middleware/loggers.js'
import { bilbomdQueue } from './bilbomd.js'
import { multimdQueue } from './multimd.js'
import { scoperQueue } from './scoper.js'
import { redis } from './redisConn.js'

// BullMQ states in which a job hasn't been picked up by a worker yet (jobs in
// a paused queue stay 'waiting')
const NOT_STARTED: JobType[] = [
  'waiting',
  'delayed',
  'prioritized',
  'waiting-children'
]

interface CancelDeps {
  queues: Queue[]
  publisher: { publish: (channel: string, message: string) => Promise<unknown> }
}

// Stops a job wherever it is: queued entries are removed from BullMQ, and a
// cancel message tells whichever worker is running it to abort its processes
// (see apps/worker/src/workers/cancelListener.ts). Returns how many queued
// entries were removed.
export const requestJobCancellation = async (
  jobid: string,
  reason: string,
  deps: CancelDeps = {
    queues: [bilbomdQueue, multimdQueue, scoperQueue],
    publisher: redis
  }
): Promise<number> => {
  let removed = 0
  for (const queue of deps.queues) {
    const queued = await queue.getJobs(NOT_STARTED)
    for (const job of queued) {
      if (job?.data?.jobid === jobid) {
        await job.remove()
        removed++
        logger.info(`Removed queued ${queue.name} job ${job.id} for ${jobid}`)
      }
    }
  }

  const message: JobCancelMessage = { jobid, reason }
  await deps.publisher.publish(JOB_CANCEL_CHANNEL, JSON.stringify(message))
  logger.info(`Requested cancellation of ${jobid}: ${reason}`)
  return removed
}
