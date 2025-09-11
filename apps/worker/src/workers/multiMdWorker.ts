import { multiMdHandler } from '../workerHandlers/multiMdHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

let multiMdActiveJobsCount = 0

export const createMultiMDWorker = (options: WorkerOptions): Worker => {
  const multiMdWorker = new Worker('multimd', multiMdHandler, options)
  logger.info(`BilboMD Multi Worker started`)

  multiMdWorker.on('active', () => {
    multiMdActiveJobsCount++
    logger.info(`BilboMD Multi Worker Active Jobs: ${multiMdActiveJobsCount}`)
  })

  multiMdWorker.on('completed', () => {
    multiMdActiveJobsCount--
    logger.info(
      `BilboMD Multi Worker Active Jobs after completion: ${multiMdActiveJobsCount}`
    )
  })

  multiMdWorker.on('failed', () => {
    multiMdActiveJobsCount--
    logger.info(
      `BilboMD Multi Worker Active Jobs after failure: ${multiMdActiveJobsCount}`
    )
  })

  return multiMdWorker
}
