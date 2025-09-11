import { Queue, QueueEvents } from 'bullmq'
import { logger } from '../middleware/loggers.js'
import { BullMQPdb2Crd } from '../types/bilbomd.js'
import { config } from '../config/config.js'
import { redis } from './redisConn.js'

let pdb2crdQueue: Queue | undefined

const getQueue = (): Queue => {
  if (!pdb2crdQueue) {
    pdb2crdQueue = new Queue('pdb2crd', {
      connection: redis,
      defaultJobOptions: {
        attempts: config.bullmqAttempts
      }
    })
  }
  return pdb2crdQueue
}

const closeQueue = async () => {
  const queue = getQueue()
  await queue.close()
  await redis.quit()
}

const pdb2crdQueueEvents = new QueueEvents('pdb2crd', {
  connection: redis
})

const waitForJobCompletion = async (
  jobId: string,
  pdb2crdQueueEvents: QueueEvents
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const onCompleted = (event: { jobId: string; returnvalue?: unknown }) => {
      if (event.jobId === jobId) {
        pdb2crdQueueEvents.off('completed', onCompleted)
        pdb2crdQueueEvents.off('failed', onFailed)
        resolve()
      }
    }

    const onFailed = (event: { jobId: string; failedReason?: string }) => {
      if (event.jobId === jobId) {
        pdb2crdQueueEvents.off('completed', onCompleted)
        pdb2crdQueueEvents.off('failed', onFailed)
        reject(new Error(`Job ${jobId} failed with reason: ${event.failedReason}`))
      }
    }

    pdb2crdQueueEvents.on('completed', onCompleted)
    pdb2crdQueueEvents.on('failed', onFailed)
  })
}

const queueJob = async (data: BullMQPdb2Crd): Promise<string> => {
  try {
    const queue = getQueue()
    logger.info(`${data.type} Job ${data.title} about to be added to ${queue.name} queue`)
    // const bullJob = await queue.add(data.title, data)
    const bullJob = await queue.add(data.title, data, { jobId: data.uuid })
    logger.info(`${data.type} Job added with Job ID: ${bullJob.id}`)
    if (!bullJob.id) {
      throw new Error('Failed to obtain a job ID from BullMQ')
    }
    return bullJob.id
  } catch (error) {
    logger.error(`Error adding ${data.type} Job to  queue: ${error}`)
    throw error
  }
}

const queue = getQueue()

export {
  queueJob,
  queue as pdb2crdQueue,
  closeQueue,
  pdb2crdQueueEvents,
  waitForJobCompletion
}
