import { webhooksHandler } from '../workerHandlers/webhooksHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

let webhooksActiveJobsCount = 0

export const createWebhooksWorker = (options: WorkerOptions): Worker => {
  const webhooksWorker = new Worker('webhooks', webhooksHandler, options)
  logger.info(`Webhooks Worker started`)

  webhooksWorker.on('active', () => {
    webhooksActiveJobsCount++
    logger.info(`Webhooks Worker Active Jobs: ${webhooksActiveJobsCount}`)
  })

  webhooksWorker.on('completed', () => {
    webhooksActiveJobsCount--
    logger.info(
      `Webhooks Worker Active Jobs after completion: ${webhooksActiveJobsCount}`
    )
  })

  webhooksWorker.on('failed', () => {
    webhooksActiveJobsCount--
    logger.info(`Webhooks Worker Active Jobs after failure: ${webhooksActiveJobsCount}`)
  })

  return webhooksWorker
}
