import { Job as BullMQJob } from 'bullmq'
import { Job } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../helpers/loggers.js'
// import { initializeNerscJob } from '../functions/job-utils.js'
import {
  updateNerscSpecificSteps,
  makeBilboMDSlurm,
  submitBilboMDSlurm
} from '../functions/bilbomd-step-functions-nersc.js'

const processBilboMDJobNersc = async (MQjob: BullMQJob) => {
  try {
    await MQjob.updateProgress(1)

    const foundJob = await Job.findOne({ _id: MQjob.data.jobid }).populate('user').exec()
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
      logger.info(`Submitted bilbomd.slurm: ${MQjob.data.uuid} with jobID: ${nerscJobID}`)
      await MQjob.updateProgress(100)
    } catch (error) {
      logger.error(`Failed to submit bilbomd.slurm: ${MQjob.data.uuid}`)
      throw error
    }
  } catch (error) {
    logger.error(`Failed to process job: ${MQjob.data.uuid}`)
    throw error
  }
}

export { processBilboMDJobNersc }
