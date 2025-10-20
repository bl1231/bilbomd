// import { config } from '../../config/config.js'
import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../helpers/loggers.js'

const renderMovieJob = async (MQjob: BullMQJob) => {
  logger.info(`Processing DCD to MP4 Job: ${MQjob.data.uuid}`)
  try {
  } catch (error) {
    logger.error(`Failed to process DCD to MP4 Job: ${MQjob.data.uuid}`)
    throw error
  }
}

export { renderMovieJob }
