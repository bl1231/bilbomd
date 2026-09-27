import {
  IJob,
  IMultiJob,
  Job,
  IStepStatus,
  IBilboMDSteps,
  StepStatusEnum,
  buildStepStatusUpdate
} from '@bilbomd/mongodb-schema'
import { logger } from './helpers/loggers.js'

const updateStepStatus = async (
  job: IJob | IMultiJob,
  stepName: keyof IBilboMDSteps,
  status: IStepStatus
) => {
  try {
    // Use atomic update to avoid ParallelSaveError. The pipeline form also
    // stamps started_at / completed_at / duration_ms server-side.
    await Job.updateOne(
      { _id: job._id },
      buildStepStatusUpdate(stepName, status),
      { updatePipeline: true }
    )
    // logger.info(`Successfully updated ${stepName} status for job ${job._id}`)
  } catch (error) {
    logger.error(
      `Error updating step status for job ${job._id} in step ${stepName}: ${error}`
    )
  }
}

// Update specific result fields using dot notation to avoid clobbering
const updateJobResults = async (
  job: IJob,
  fieldUpdates: Record<string, string | number | boolean>
) => {
  try {
    await Job.updateOne({ _id: job._id }, { $set: fieldUpdates })
    // logger.info(`Successfully updated results for job ${job._id}`)
  } catch (error) {
    logger.error(`Error updating results for job ${job._id}: ${error}`)
  }
}

const handleStepError = async (
  jobId: string,
  stepName: keyof IBilboMDSteps,
  error: unknown
) => {
  // Convert error to string if it's not an Error object
  const errorMessage = error instanceof Error ? error.message : String(error)
  // Update the step status to 'Error'
  await Job.findByIdAndUpdate(
    jobId,
    buildStepStatusUpdate(stepName, { status: 'Error' }),
    { new: true, updatePipeline: true }
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

// Update job progress using atomic update
const updateJobProgress = async (job: IJob, progress: number) => {
  try {
    await Job.updateOne({ _id: job._id }, { $set: { progress } })
    // logger.info(`Successfully updated progress to ${progress} for job ${job._id}`)
  } catch (error) {
    logger.error(`Error updating progress for job ${job._id}: ${error}`)
  }
}

export {
  updateStepStatus,
  handleStepError,
  updateJobStatus,
  updateJobResults,
  updateJobProgress
}
