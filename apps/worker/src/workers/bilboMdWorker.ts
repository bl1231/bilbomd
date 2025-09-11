import { bilboMdHandler } from '../workerHandlers/bilboMdHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

let bilboMdActiveJobsCount = 0

export const createBilboMdWorker = (options: WorkerOptions): Worker => {
  const bilboMdWorker = new Worker('bilbomd', bilboMdHandler, options)
  logger.info(`BilboMD Worker started`)

  bilboMdWorker.on('active', () => {
    bilboMdActiveJobsCount++
    logger.info(`BilboMD Worker Active Jobs: ${bilboMdActiveJobsCount}`)
  })

  bilboMdWorker.on('completed', () => {
    bilboMdActiveJobsCount--
    logger.info(`BilboMD Worker Active Jobs after completion: ${bilboMdActiveJobsCount}`)
  })

  bilboMdWorker.on('failed', () => {
    bilboMdActiveJobsCount--
    logger.info(`BilboMD Worker Active Jobs after failure: ${bilboMdActiveJobsCount}`)
  })

  return bilboMdWorker
}
