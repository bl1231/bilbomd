import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { renderMovieJob } from '../services/pipelines/dcd-to-mp4.js'
import { WorkerJob } from '../types/jobtypes.js'

export const movieHandler = async (job: Job<WorkerJob>) => {
  try {
    logger.info(`webhooksHandler JOB.DATA: ${JSON.stringify(job.data)}`)
    switch (job.data.type) {
      case 'dcd-to-mp4':
        logger.info(`Start DCD to MP4 job: ${job.name}`)
        await renderMovieJob(job)
        logger.info(`Finish DCD to MP4 job: ${job.name}`)
        break
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
  }
}
