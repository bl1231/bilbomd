import {
  getActiveCount as getActiveCountBilbomd,
  getWaitingCount as getWaitingCountBilbomd,
  getWorkers as getWorkersBilbomd
} from '../queues/bilbomd.js'
import {
  getActiveCount as getActiveCountScoper,
  getWaitingCount as getWaitingCountScoper,
  getWorkers as getWorkersScoper
} from '../queues/scoper.js'
import { Request, Response } from 'express'

interface QueueStatus {
  bilbomd: {
    active_count: number
    waiting_count: number
    worker_count: number
  }
  scoper: {
    active_count: number
    waiting_count: number
    worker_count: number
  }
}

const getQueueStatus = async (req: Request, res: Response) => {
  const bilbomdActiveCount = await getActiveCountBilbomd()
  const bilbomdWaitCount = await getWaitingCountBilbomd()
  const bilbomdWorkerCount = (await getWorkersBilbomd()).length
  const scoperActiveCount = await getActiveCountScoper()
  const scoperWaitCount = await getWaitingCountScoper()
  const scoperWorkerCount = (await getWorkersScoper()).length

  const queueStatus: QueueStatus = {
    bilbomd: {
      active_count: bilbomdActiveCount,
      waiting_count: bilbomdWaitCount,
      worker_count: bilbomdWorkerCount
    },
    scoper: {
      active_count: scoperActiveCount,
      waiting_count: scoperWaitCount,
      worker_count: scoperWorkerCount
    }
  }

  // logger.info(queueStatus)
  res.json(queueStatus)
}

export { getQueueStatus }
