import { bilboMdHandler } from '../workerHandlers/bilboMdHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { reportFailedJob } from '../services/functions/job-failure.js'

export const createBilboMdWorker = (options: WorkerOptions): Worker => {
  const bilboMdWorker = new Worker('bilbomd', bilboMdHandler, options)
  logger.info(`BilboMD Worker started`)

  // Without a listener BullMQ prints Redis errors as raw stack traces.
  bilboMdWorker.on('error', (error) => {
    logger.warn(`BilboMD Worker error: ${error.message}`)
  })

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

  bilboMdWorker.on('failed', (job, error) => {
    activeJobsCount--
    logger.info(`BilboMD Worker Active Jobs after failure: ${activeJobsCount}`)
    void reportFailedJob('bilbomd', job, error)
  })

  return bilboMdWorker
}
