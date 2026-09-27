import type { Redis } from 'ioredis'
import {
  JOB_CANCEL_CHANNEL,
  type JobCancelMessage
} from '@bilbomd/bilbomd-types'
import { cancelRunningJob } from '../helpers/jobCancellation.js'
import { logger } from '../helpers/loggers.js'

export const handleCancelMessage = (raw: string): void => {
  let msg: Partial<JobCancelMessage>
  try {
    msg = JSON.parse(raw)
  } catch {
    logger.warn(`Ignoring malformed job cancel message: ${raw}`)
    return
  }
  if (typeof msg.jobid !== 'string' || !msg.jobid) {
    logger.warn(`Ignoring job cancel message without a jobid: ${raw}`)
    return
  }
  const count = cancelRunningJob(msg.jobid, msg.reason ?? 'cancelled')
  if (count === 0) {
    logger.debug(`Job ${msg.jobid} is not running on this worker`)
  }
}

// Subscribes to cancel requests from the backend. A subscribed ioredis
// connection can't run other commands, so this takes its own connection
// (e.g. redis.duplicate()). Returns a function that unsubscribes and closes it.
export const startCancelListener = async (
  subscriber: Redis
): Promise<() => Promise<void>> => {
  subscriber.on('message', (channel: string, raw: string) => {
    if (channel === JOB_CANCEL_CHANNEL) handleCancelMessage(raw)
  })
  await subscriber.subscribe(JOB_CANCEL_CHANNEL)
  logger.info(`Listening for job cancellations on ${JOB_CANCEL_CHANNEL}`)

  return async () => {
    await subscriber.unsubscribe(JOB_CANCEL_CHANNEL)
    await subscriber.quit()
  }
}
