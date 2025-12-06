import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { renderMovieJob } from '../services/pipelines/dcd-to-mp4.js'
import { WorkerJob } from '../types/jobtypes.js'

export const movieHandler = async (job: Job<WorkerJob>) => {
  try {
    logger.info(`workerHandler job.data: ${JSON.stringify(job.data)}`)
    switch (job.name) {
      case 'render-movie':
        logger.info(`Start DCD to MP4 job: ${job.name}`)
        await renderMovieJob(job)
        logger.info(`Finish DCD to MP4 job: ${job.name}`)
        break
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
  }
}
