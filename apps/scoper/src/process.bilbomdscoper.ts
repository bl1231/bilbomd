// import { logger } from './helpers/loggers.js'
import { Job as BullMQJob } from 'bullmq'
import { BilboMdScoperJob } from '@bilbomd/mongodb-schema'
import { runScoper, prepareScoperResults } from './scoper.functions.js'
import { updateJobProgress } from './mongo-utils.js'
import { initializeJob, cleanupJob } from './scoper-job-utils.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from './functions/usageEvents.js'

const processBilboMDScoperJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdScoperJob.findOne({ _id: MQjob.data.jobid })
    .populate({
      path: 'user',
      select: 'email'
    })
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)
  await updateJobProgress(foundJob, 5)

  // Record job start
  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'scoper',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  // Initialize
  await initializeJob(MQjob, foundJob)
  await MQjob.updateProgress(10)
  await updateJobProgress(foundJob, 10)

  // Run the Scoper IonNet pipeline
  await runScoper(MQjob, foundJob)
  await MQjob.updateProgress(80)
  await updateJobProgress(foundJob, 80)

  // Combine the RNA and Mg PDB files
  await prepareScoperResults(MQjob, foundJob)
  await MQjob.updateProgress(90)
  await updateJobProgress(foundJob, 90)

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
  await updateJobProgress(foundJob, 100)

  // Record job completion with duration if available
  const durationMs =
    foundJob.time_started && foundJob.time_completed
      ? new Date(foundJob.time_completed).getTime() -
        new Date(foundJob.time_started).getTime()
      : undefined
  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'scoper',
    eventType: 'job_completed',
    status: 'Completed',
    durationMs,
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })
}

export { processBilboMDScoperJob }
