import { movieHandler } from '../workerHandlers/movieHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

export const createMovieWorker = (options: WorkerOptions): Worker => {
  const movieWorker = new Worker('movie', movieHandler, options)
  logger.info(`Movie Worker started`)

  // Use closure to encapsulate counter instead of module-level state
  let activeJobsCount = 0

  movieWorker.on('active', () => {
    activeJobsCount++
    logger.info(`Movie Worker Active Jobs: ${activeJobsCount}`)
  })

  movieWorker.on('completed', () => {
    activeJobsCount--
    logger.info(`Movie Worker Active Jobs after completion: ${activeJobsCount}`)
  })

  movieWorker.on('failed', () => {
    activeJobsCount--
    logger.info(`Movie Worker Active Jobs after failure: ${activeJobsCount}`)
  })

  return movieWorker
}
