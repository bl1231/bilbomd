import {
  IJob,
  IMultiJob,
  Job,
  IStepStatus,
  IBilboMDSteps,
  buildStepStatusUpdate
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { notifyJobChanged } from '../../helpers/jobEvents.js'

import type { JobStatusEnum } from '@bilbomd/mongodb-schema'

const updateStepStatus = async (
  job: IJob | IMultiJob,
  stepName: keyof IBilboMDSteps,
  status: IStepStatus
) => {
  try {
    const createdSteps = !job.steps
    job.steps ??= {} as IBilboMDSteps
    // Keep the in-memory document in sync for later reads. Timing fields are
    // stamped server-side, so this copy lacks them and must not count as a
    // pending change: otherwise the next job.save() writes it back and wipes
    // started_at / completed_at / duration_ms.
    job.steps[stepName] = { ...job.steps[stepName], ...status }
    job.unmarkModified(`steps.${stepName}`)
    if (createdSteps) job.unmarkModified('steps')

    // Persist with an atomic field update instead of job.save() to avoid
    // ParallelSaveError ("Can't save() the same doc multiple times in parallel")
    // when concurrent steps — e.g. the parallel per-Rg OpenMM MD runs — report
    // status on the same document instance. updateOne() targets only this nested
    // field and is not subject to the in-flight-save guard. The pipeline form
    // also stamps started_at / completed_at / duration_ms (see
    // buildStepStatusUpdate in @bilbomd/mongodb-schema).
    await job.updateOne(buildStepStatusUpdate(stepName, status), {
      updatePipeline: true
    })
    notifyJobChanged(job)
    // logger.info(`Successfully updated ${stepName} status for job ${job._id}`)
  } catch (error) {
    logger.error(
      `Error updating step status for job ${job._id} in step ${stepName}: ${error}`
    )
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
  status: JobStatusEnum
): Promise<void> => {
  job.status = status
  await job.save()
  notifyJobChanged(job)
}

export { updateStepStatus, handleStepError, updateJobStatus }
