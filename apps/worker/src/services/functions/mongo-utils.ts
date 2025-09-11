import {
  IJob,
  IMultiJob,
  Job,
  IStepStatus,
  IBilboMDSteps
} from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../helpers/loggers.js'

const updateStepStatus = async (
  job: IJob | IMultiJob,
  stepName: keyof IBilboMDSteps,
  status: IStepStatus
) => {
  try {
    // Update the specific step directly on the Job document
    job.steps[stepName] = status

    // Save the modified document
    await job.save()
    // logger.info(`Successfully updated ${stepName} status for job ${job._id}`)
  } catch (error) {
    logger.error(
      `Error updating step status for job ${job._id} in step ${stepName}: ${error}`
    )
  }
}

const handleStepError = async (jobId: string, stepName: string, error: unknown) => {
  // Convert error to string if it's not an Error object
  const errorMessage = error instanceof Error ? error.message : String(error)
  // Update the step status to 'Error'
  await Job.findByIdAndUpdate(
    jobId,
    { [`steps.${stepName}.status`]: 'Error' },
    { new: true }
  )
  // Log the error
  logger.error(`Error in ${stepName}: ${errorMessage}`)
}

export { updateStepStatus, handleStepError }
