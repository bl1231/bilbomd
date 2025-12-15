import { Job as BullMQJob } from 'bullmq'
import { MultiJob, IUser } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import {
  prepareMultiMDdatFileList,
  runMultiFoxs,
  prepareMultiMDResults,
  cleanupJob,
  initializeJob
} from '../functions/bilbomd-multi-functions.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usageEvents.js'

const processMultiMDJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)
  const job = await MultiJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .populate('bilbomd_jobs')
    .exec()
  if (!job) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  logger.info(`Processing MultiJob: ${job.uuid}`)

  // Record job start
  await recordWorkerUsageEvent({
    uuid: job.uuid,
    jobId: job._id,
    pipeline: 'multi',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: 'user',
      user: job.user as IUser | null | undefined,
      public_id: undefined,
      client_ip_hash: undefined
    })
  })

  // Initialize
  await initializeJob(job)
  job.progress = 5
  await job.save()

  // create a file that references all .dat files
  await prepareMultiMDdatFileList(job)
  job.progress = 30
  await job.save()

  // Run MultiFoXS
  await runMultiFoxs(job)
  job.progress = 80
  await job.save()

  // Gather results
  await prepareMultiMDResults(job)
  job.progress = 90
  await job.save()

  // Send results to user
  await cleanupJob(job)

  // Update BullMQ job progress
  await MQjob.updateProgress(100)

  // Record job completion
  const durationMs =
    job.time_started && job.time_completed
      ? new Date(job.time_completed).getTime() -
        new Date(job.time_started).getTime()
      : undefined
  await recordWorkerUsageEvent({
    uuid: job.uuid,
    jobId: job._id,
    pipeline: 'multi',
    eventType: 'job_completed',
    status: 'Completed',
    durationMs,
    context: buildContext({
      access_mode: 'user',
      user: job.user as IUser | null | undefined,
      public_id: undefined,
      client_ip_hash: undefined
    })
  })
}

export { processMultiMDJob }
