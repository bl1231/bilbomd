import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { processPdb2CrdJob } from '../services/pipelines/pdb-to-crd.js'
import { WorkerJob } from '../types/jobtypes.js'

export const pdb2CrdHandler = async (job: Job<WorkerJob>) => {
  logger.info(`pdb2CrdHandler: ${JSON.stringify(job.data)}`)
  try {
    logger.info(`Start Pdb2Crd job: ${job.name}`)
    await processPdb2CrdJob(job)
    logger.info(`Finished job: ${job.name}`)
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
  }
}
