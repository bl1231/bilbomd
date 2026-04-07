import { logger } from '../helpers/loggers.js'
import { Queue } from 'bullmq'
import { redis } from './redisConn.js'

let movieQueue: Queue

const getQueue = (): Queue => {
  if (!movieQueue) {
    movieQueue = new Queue('movie', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3
      }
    })
  }
  return movieQueue
}

const queueJob = async (data: MovieJobData) => {
  try {
    const queue = getQueue()
    logger.info(`Job ${data.jobId} about to be added to ${queue.name} queue`)

    const bullJob = await queue.add(data.jobId, data)

    return bullJob.id
  } catch (error) {
    logger.error(
      `Error adding Job ${data.jobId} to ${queue.name} queue: ${error}`
    )
    throw error
  }
}

const queue = getQueue()

export { queueJob, queue as movieQueue }
