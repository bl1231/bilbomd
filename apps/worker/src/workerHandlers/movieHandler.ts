import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { renderMovieJob } from '../services/pipelines/dcd-to-mp4.js'
import { WorkerJob } from '../types/jobtypes.js'
import { runCancellable } from '../helpers/jobCancellation.js'

export const movieHandler = async (
  job: Job<WorkerJob>,
  _token?: string,
  signal?: AbortSignal
) => {
  try {
    logger.info(`workerHandler job.data: ${JSON.stringify(job.data)}`)
    switch (job.name) {
      case 'render-movie':
        logger.info(`Start DCD to MP4 job: ${job.name}`)
        // Movie jobs carry the parent job's Mongo id as `jobId`, so deleting
        // a job also cancels its renders
        await runCancellable(
          (job.data as { jobId?: string }).jobId,
          () => renderMovieJob(job),
          signal
        )
        logger.info(`Finish DCD to MP4 job: ${job.name}`)
        break
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
    throw error // Re-throw to mark job as failed in BullMQ
  }
}
