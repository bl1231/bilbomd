import { Job as BullMQJob } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { processMultiMDJob } from '../services/pipelines/bilbomd-multi.js'
import { WorkerJob } from '../types/jobtypes.js'

export const multiMdHandler = async (job: BullMQJob<WorkerJob>) => {
  logger.info(`bilboMdHandler: ${JSON.stringify(job.data)}`)
  try {
    logger.info(`Start BilboMD PDB job: ${job.name}`)
    await processMultiMDJob(job)
    logger.info(`Finish job: ${job.name}`)
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
  }
}
