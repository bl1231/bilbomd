import { Job as BullMQJob } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { processMultiMDJob } from '../services/pipelines/bilbomd-multi.js'
import { WorkerJob } from '../types/jobtypes.js'
import { runCancellable } from '../helpers/jobCancellation.js'

export const multiMdHandler = async (
  job: BullMQJob<WorkerJob>,
  _token?: string,
  signal?: AbortSignal
) => {
  logger.info(`bilboMdHandler: ${JSON.stringify(job.data)}`)
  try {
    logger.info(`Start BilboMD PDB job: ${job.name}`)
    await runCancellable(
      (job.data as { jobid?: string }).jobid,
      () => processMultiMDJob(job),
      signal
    )
    logger.info(`Finish job: ${job.name}`)
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
    throw error // Re-throw to mark job as failed in BullMQ
  }
}
