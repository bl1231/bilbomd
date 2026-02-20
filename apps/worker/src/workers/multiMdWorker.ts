import { multiMdHandler } from '../workerHandlers/multiMdHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

export const createMultiMDWorker = (options: WorkerOptions): Worker => {
  const multiMdWorker = new Worker('multimd', multiMdHandler, options)
  logger.info(`BilboMD Multi Worker started`)

  // Use closure to encapsulate counter instead of module-level state
  let activeJobsCount = 0

  multiMdWorker.on('active', () => {
    activeJobsCount++
    logger.info(`BilboMD Multi Worker Active Jobs: ${activeJobsCount}`)
  })

  multiMdWorker.on('completed', () => {
    activeJobsCount--
    logger.info(
      `BilboMD Multi Worker Active Jobs after completion: ${activeJobsCount}`
    )
  })

  multiMdWorker.on('failed', () => {
    activeJobsCount--
    logger.info(
      `BilboMD Multi Worker Active Jobs after failure: ${activeJobsCount}`
    )
  })

  return multiMdWorker
}
