import { movieHandler } from '../workerHandlers/movieHandler.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from '../helpers/loggers.js'

let movieActiveJobsCount = 0

export const createMovieWorker = (options: WorkerOptions): Worker => {
  const movieWorker = new Worker('movie', movieHandler, options)
  logger.info(`Movie Worker started`)

  movieWorker.on('active', () => {
    movieActiveJobsCount++
    logger.info(`Movie Worker Active Jobs: ${movieActiveJobsCount}`)
  })

  movieWorker.on('completed', () => {
    movieActiveJobsCount--
    logger.info(
      `Movie Worker Active Jobs after completion: ${movieActiveJobsCount}`
    )
  })

  movieWorker.on('failed', () => {
    movieActiveJobsCount--
    logger.info(
      `Movie Worker Active Jobs after failure: ${movieActiveJobsCount}`
    )
  })

  return movieWorker
}
