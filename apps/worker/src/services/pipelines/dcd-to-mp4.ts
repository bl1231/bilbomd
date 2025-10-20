// import { config } from '../../config/config.js'
import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../helpers/loggers.js'
import { runGenerateMovies } from '../functions/movie-worker.js'

const renderMovieJob = async (MQjob: BullMQJob) => {
  logger.info(`Processing DCD to MP4 Job: ${MQjob.data.uuid}`)
  try {
    await runGenerateMovies(MQjob, MQjob.data)
  } catch (error) {
    logger.error(`Failed to process DCD to MP4 Job: ${MQjob.data.uuid}`)
    throw error
  }
}

export { renderMovieJob }
