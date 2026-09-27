import { Job as BullMQJob } from 'bullmq'
import { Job, IJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import {
  updateNerscSpecificSteps,
  makeBilboMDSlurm,
  submitBilboMDSlurm
} from '../functions/nersc-slurm.js'
import {
  recordWorkerUsageEvent,
  buildContext,
  toPipeline
} from '../functions/usage-events.js'

// Usage event for the Slurm submission. The job's completion is recorded
// later by the NERSC job monitor.
const recordSubmission = (
  job: IJob,
  outcome:
    | { eventType: 'job_started'; nerscJobID: string }
    | { eventType: 'job_failed'; error: unknown }
) =>
  recordWorkerUsageEvent({
    uuid: job.uuid,
    jobId: job._id,
    pipeline: toPipeline(
      job.__t.replace('BilboMd', '').toLowerCase() || 'auto'
    ),
    eventType: outcome.eventType,
    status: outcome.eventType === 'job_started' ? 'Pending' : 'Failed',
    nersc: {
      jobid:
        outcome.eventType === 'job_started' ? outcome.nerscJobID : undefined,
      qos: job.nersc?.qos
    },
    context: buildContext({
      access_mode: job.access_mode,
      user: job.user,
      public_id: undefined,
      client_ip_hash: undefined
    }),
    metadata:
      outcome.eventType === 'job_started'
        ? { stage: 'submitSlurm' }
        : { stage: 'submitSlurm', error: (outcome.error as Error)?.message }
  })

const processBilboMDJobNersc = async (MQjob: BullMQJob) => {
  try {
    await MQjob.updateProgress(1)

    const foundJob = await Job.findOne({ _id: MQjob.data.jobid })
      .populate('user')
      .exec()
    if (!foundJob) {
      throw new Error(`No job found for: ${MQjob.data.jobid}`)
    }
    await MQjob.updateProgress(5)

    await MQjob.updateProgress(10)

    // Add any missing NERSC-specific job steps
    try {
      await updateNerscSpecificSteps(foundJob)
    } catch (error) {
      logger.error(`Failed to add NERSC-specific job steps: ${MQjob.data.uuid}`)
      throw error
    }

    // Prepare bilbomd.slurm file
    try {
      await makeBilboMDSlurm(MQjob, foundJob)
      await MQjob.updateProgress(15)
    } catch (error) {
      logger.error(`Failed to prepare bilbomd.slurm file: ${MQjob.data.uuid}`)
      throw error
    }

    // Submit bilbomd.slurm to the queueing system
    let nerscJobID: string
    try {
      nerscJobID = await submitBilboMDSlurm(MQjob, foundJob)
      logger.info(
        `Submitted bilbomd.slurm: ${MQjob.data.uuid} with jobID: ${nerscJobID}`
      )

      await recordSubmission(foundJob, {
        eventType: 'job_started',
        nerscJobID
      })
      await MQjob.updateProgress(100)
    } catch (error) {
      logger.error(`Failed to submit bilbomd.slurm: ${MQjob.data.uuid}`)
      await recordSubmission(foundJob, { eventType: 'job_failed', error })
      throw error
    }
  } catch (error) {
    logger.error(`Failed to process job: ${MQjob.data.uuid}`)
    throw error
  }
}

export { processBilboMDJobNersc }
