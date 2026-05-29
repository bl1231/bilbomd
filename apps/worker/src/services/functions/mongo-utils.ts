import {
  IJob,
  IMultiJob,
  Job,
  IStepStatus,
  IBilboMDSteps
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'

import type { JobStatusEnum } from '@bilbomd/mongodb-schema'

const updateStepStatus = async (
  job: IJob | IMultiJob,
  stepName: keyof IBilboMDSteps,
  status: IStepStatus
) => {
  try {
    if (!job.steps) {
      job.steps = {} as IBilboMDSteps
    }
    // Keep the in-memory document in sync for any later reads/saves
    job.steps[stepName] = status

    // Persist with an atomic field update instead of job.save() to avoid
    // ParallelSaveError ("Can't save() the same doc multiple times in parallel")
    // when concurrent steps — e.g. the parallel per-Rg OpenMM MD runs — report
    // status on the same document instance. updateOne() targets only this nested
    // field and is not subject to the in-flight-save guard.
    await job.updateOne({ $set: { [`steps.${stepName}`]: status } })
    // logger.info(`Successfully updated ${stepName} status for job ${job._id}`)
  } catch (error) {
    logger.error(
      `Error updating step status for job ${job._id} in step ${stepName}: ${error}`
    )
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
  status: JobStatusEnum
): Promise<void> => {
  job.status = status
  await job.save()
}

export { updateStepStatus, handleStepError, updateJobStatus }
