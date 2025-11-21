import {
  IJob,
  IMultiJob,
  Job,
  IStepStatus,
  IBilboMDSteps,
  StepStatusEnum,
  IJobResults
} from '@bilbomd/mongodb-schema'
import { logger } from './helpers/loggers.js'

const updateStepStatus = async (
  job: IJob | IMultiJob,
  stepName: keyof IBilboMDSteps,
  status: IStepStatus
) => {
  try {
    if (!job.steps) {
      job.steps = {} as IBilboMDSteps
    }
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

// Update the 'results' field of a Job document and save it to MongoDB
const updateJobResults = async (job: IJob, results: IJobResults) => {
  try {
    job.results = results
    await job.save()
    // logger.info(`Successfully updated results for job ${job._id}`)
  } catch (error) {
    logger.error(`Error updating results for job ${job._id}: ${error}`)
  }
}

const handleStepError = async (
  jobId: string,
  stepName: string,
  error: unknown
) => {
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

const updateJobStatus = async (
  job: IJob,
  stepName: keyof IBilboMDSteps,
  status: StepStatusEnum,
  message: string
): Promise<void> => {
  const stepStatus: IStepStatus = {
    status,
    message
  }
  await updateStepStatus(job, stepName, stepStatus)
}

export { updateStepStatus, handleStepError, updateJobStatus, updateJobResults }
