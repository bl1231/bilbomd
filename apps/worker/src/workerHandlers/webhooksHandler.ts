import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { processDockerBuildJob } from '../services/pipelines/webhooks-nersc.js'
import { WorkerJob } from '../types/jobtypes.js'

export const webhooksHandler = async (job: Job<WorkerJob>) => {
  try {
    // logger.info(`webhooksHandler JOB: ${JSON.stringify(job)}`)
    logger.info(`webhooksHandler JOB.DATA: ${JSON.stringify(job.data)}`)
    switch (job.data.type) {
      case 'docker-build':
        logger.info(`Start Docker Build job: ${job.name}`)
        await processDockerBuildJob(job)
        logger.info(`Finish Docker Build job: ${job.name}`)
        break
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
  }
}
