import { Job as BullMQJob } from 'bullmq'
import { Job } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
// import { initializeNerscJob } from '../functions/job-utils.js'
import {
  updateNerscSpecificSteps,
  makeBilboMDSlurm,
  submitBilboMDSlurm
} from '../functions/bilbomd-step-functions-nersc.js'
import {
  recordWorkerUsageEvent,
  buildContext,
  toPipeline
} from '../functions/usage-events.js'

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

    // Initialize
    try {
      // await initializeNerscJob(MQjob, foundJob)
      await MQjob.updateProgress(10)
    } catch (error) {
      logger.error(`Failed to initialize job: ${MQjob.data.uuid}`)
      throw error
    }

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

      // Record NERSC submission as usage event
      await recordWorkerUsageEvent({
        uuid: foundJob.uuid,
        jobId: foundJob._id,
        pipeline: toPipeline(
          foundJob.__t.replace('BilboMd', '').toLowerCase() || 'auto'
        ),
        eventType: 'job_started',
        status: 'Pending',
        nersc: { jobid: nerscJobID, qos: foundJob.nersc?.qos },
        context: buildContext({
          access_mode: foundJob.access_mode,
          user: foundJob.user,
          public_id: undefined,
          client_ip_hash: undefined
        }),
        metadata: { stage: 'submitSlurm' }
      })
      await MQjob.updateProgress(100)
    } catch (error) {
      logger.error(`Failed to submit bilbomd.slurm: ${MQjob.data.uuid}`)
      // Record failure to submit
      await recordWorkerUsageEvent({
        uuid: foundJob.uuid,
        jobId: foundJob._id,
        pipeline: toPipeline(
          foundJob.__t.replace('BilboMd', '').toLowerCase() || 'auto'
        ),
        eventType: 'job_failed',
        status: 'Failed',
        nersc: { jobid: undefined, qos: foundJob.nersc?.qos },
        context: buildContext({
          access_mode: foundJob.access_mode,
          user: foundJob.user,
          public_id: undefined,
          client_ip_hash: undefined
        }),
        metadata: { stage: 'submitSlurm', error: (error as Error)?.message }
      })
      throw error
    }
  } catch (error) {
    logger.error(`Failed to process job: ${MQjob.data.uuid}`)
    throw error
  }
}

export { processBilboMDJobNersc }
