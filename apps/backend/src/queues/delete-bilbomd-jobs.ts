import { Queue } from 'bullmq'
import { redis } from './redisConn.js'

let deleteBilboMDJobsQueue: Queue | undefined

const getQueue = (): Queue => {
  if (!deleteBilboMDJobsQueue) {
    deleteBilboMDJobsQueue = new Queue('delete-bilbomd', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3
      }
    })
  }
  return deleteBilboMDJobsQueue
}

const queue = getQueue()

export { queue as deleteBilboMDJobsQueue }
