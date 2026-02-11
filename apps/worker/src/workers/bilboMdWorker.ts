import { bilboMdHandler } from '../workerHandlers/bilboMdHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

export const createBilboMdWorker = (options: WorkerOptions): Worker => {
  const bilboMdWorker = new Worker('bilbomd', bilboMdHandler, options)
  logger.info(`BilboMD Worker started`)

  // Use closure to encapsulate counter instead of module-level state
  let activeJobsCount = 0

  bilboMdWorker.on('active', () => {
    activeJobsCount++
    logger.info(`BilboMD Worker Active Jobs: ${activeJobsCount}`)
  })

  bilboMdWorker.on('completed', () => {
    activeJobsCount--
    logger.info(
      `BilboMD Worker Active Jobs after completion: ${activeJobsCount}`
    )
  })

  bilboMdWorker.on('failed', () => {
    activeJobsCount--
    logger.info(`BilboMD Worker Active Jobs after failure: ${activeJobsCount}`)
  })

  return bilboMdWorker
}
