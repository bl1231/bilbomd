import {
  Job as DBJob,
  IJob,
  IBilboMDSteps,
  StepStatusEnum,
  NerscStatus,
  NerscStatusEnum,
  JobStatus,
  INerscInfo
} from '@bilbomd/mongodb-schema'
import { logger } from '../helpers/loggers.js'
import { config } from '../config/config.js'
import axios from 'axios'
import { ensureValidToken } from '../services/functions/nersc-api-token-functions.js'
import { JobStatusOutputSacct } from '../types/nersc.js'
import { getSlurmStatusFile } from '../services/functions/nersc-api-functions.js'
import {
  copyBilboMDResults,
  prepareBilboMDResults,
  sendBilboMDEmail
} from '../services/functions/job-monitor-functions.js'

const fetchIncompleteJobs = async (): Promise<IJob[]> => {
  return DBJob.find({
    status: { $ne: JobStatus.Completed }, // Jobs with a non-Completed status
    cleanup_in_progress: false,
    'nersc.state': { $ne: null } // Exclude jobs where nersc.state is undefined or null
  }).exec()
}

const queryNERSCForJobState = async (job: IJob): Promise<INerscInfo | null> => {
  try {
    const jobid = job.nersc?.jobid
    if (!jobid) {
      logger.warn('Job has no NERSC jobid.')
      await handleStateFetchFailure(job)
      return null
    }
    const nerscState = await fetchNERSCJobState(jobid)
    if (!nerscState) {
      logger.warn(`Failed to fetch NERSC state for job ${jobid}.`)
      await handleStateFetchFailure(job)
      return null
    }
    return nerscState
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Error querying NERSC for job ${job.nersc?.jobid}: ${msg}`)
    await handleMonitoringError(job, error)
    return null
  }
}

const updateJobStateInMongoDB = async (
  job: IJob,
  nerscState: INerscInfo
): Promise<void> => {
  try {
    await updateJobNerscState(job, nerscState)
    const progress = await calculateProgress(job.steps)
    job.progress = progress
    const jobid = job.nersc?.jobid ?? 'unknown'
    const state = job.nersc?.state ?? 'unknown'
    logger.info(`Job: ${jobid} State: ${state} Progress: ${progress}%`)
    await job.save()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Error updating job ${job.nersc?.jobid} in MongoDB: ${msg}`)
    await handleMonitoringError(job, error)
  }
}

const markJobAsCompleted = async (job: IJob): Promise<void> => {
  try {
    // Skip if already Completed
    if (job.status === 'Completed') {
      return
    }

    // Skip if cleanup is already in progress
    if (job.cleanup_in_progress) {
      return
    }

    const jobid = job.nersc?.jobid ?? 'unknown'
    logger.info(`Job ${jobid} is COMPLETED. Initiating cleanup.`)
    job.cleanup_in_progress = true
    await job.save()

    await performJobCleanup(job)

    job.cleanup_in_progress = false
    await job.save()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Error during cleanup for job ${job.nersc?.jobid}: ${msg}`)

    // Make sure to reset the flag so it's not stuck forever
    job.cleanup_in_progress = false
    await job.save()
  }
}

const markJobAsFailed = async (job: IJob): Promise<void> => {
  try {
    const jobid = job.nersc?.jobid ?? 'unknown'
    logger.info(`Marking job ${jobid} as FAILED`)
    job.status = 'Failed'
    await job.save()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Error marking job ${job.nersc?.jobid} as FAILED: ${msg}`)
  }
}

const markJobAsCancelled = async (job: IJob): Promise<void> => {
  try {
    const jobid = job.nersc?.jobid ?? 'unknown'
    logger.info(`Marking job ${jobid} as CANCELLED`)
    job.status = 'Cancelled'
    await job.save()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Error marking job ${job.nersc?.jobid} as CANCELLED: ${msg}`)
  }
}

const markJobAsPending = async (job: IJob): Promise<void> => {
  try {
    job.status = 'Pending'
    await job.save()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Error marking job ${job.nersc?.jobid} as PENDING: ${msg}`)
  }
}

const markJobAsRunning = async (job: IJob): Promise<void> => {
  try {
    job.status = 'Running'
    await job.save()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`Error marking job ${job.nersc?.jobid} as RUNNING: ${msg}`)
  }
}

const monitorAndCleanupJobs = async (): Promise<void> => {
  try {
    logger.info('Starting job monitoring and cleanup...')

    // Step 1: Fetch all jobs where nersc.state is not null
    //  from MongoDB
    const jobs = await fetchIncompleteJobs()
    logger.info(`Found ${jobs.length} jobs in with non-Completed state.`)

    for (const job of jobs) {
      const nerscState = await queryNERSCForJobState(job)
      if (!nerscState) continue // Skip if NERSC state could not be fetched

      // Step 2: Update the job state in MongoDB
      await updateJobStateInMongoDB(job, nerscState)

      // Step 3: Handle the job based on its NERSC state
      switch (nerscState.state) {
        case 'COMPLETED':
          await markJobAsCompleted(job)
          break

        case 'FAILED':
        case 'TIMEOUT':
        case 'OUT_OF_MEMORY':
        case 'NODE_FAIL':
          // Maybe resubmit job if it times out?
          logger.warn(
            `Job ${job.nersc?.jobid} failed with state: ${nerscState.state}`
          )
          await markJobAsFailed(job)
          break

        case 'CANCELLED':
        case 'PREEMPTED':
          logger.info(`Job ${job.nersc?.jobid} was cancelled or preempted.`)
          await markJobAsCancelled(job)
          break

        case 'PENDING':
          await markJobAsPending(job)
          break

        case 'RUNNING':
          await markJobAsRunning(job)
          break

        case 'SUSPENDED':
          logger.warn(`Job ${job.nersc?.jobid} is suspended. Will retry later.`)
          break

        case 'UNKNOWN':
        default:
          logger.error(
            `Job ${job.nersc?.jobid} is in an unexpected state: ${nerscState.state}`
          )
          break
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Error during job monitoring: ${msg}`)
  }
}

const handleMonitoringError = async (
  job: IJob,
  error: unknown
): Promise<void> => {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? (error as { message: string }).message
      : String(error)
  await updateSingleJobStep(job, 'nersc_job_status', 'Error', `Error: ${msg}`)
  job.status = 'Error'
  await job.save()
}

const updateJobNerscState = async (
  job: IJob,
  nerscState: INerscInfo
): Promise<void> => {
  if (!job.nersc) {
    job.nersc = {} as INerscInfo
  }
  job.nersc.state = nerscState.state
  job.nersc.qos = nerscState.qos
  job.nersc.time_started = nerscState.time_started
  job.nersc.time_completed = nerscState.time_completed

  await job.save()
  // logger.info(`Updated job ${job.nersc.jobid} with state: ${nerscState.state}`)

  // Update NERSC job status step
  await updateSingleJobStep(
    job,
    'nersc_job_status',
    'Success',
    `NERSC job status: ${nerscState.state}`
  )

  // Update the job steps from the Slurm status file
  await updateJobStepsFromSlurmStatusFile(job)
}

// Normalizes raw Slurm state to your internal enum
const normalizeState = (state: string): NerscStatusEnum => {
  const map: Record<string, NerscStatusEnum> = {
    NODE_FAIL: NerscStatus.FAILED,
    OUT_OF_MEMORY: NerscStatus.FAILED,
    PREEMPTED: NerscStatus.FAILED
  }

  return (
    map[state] ||
    (NerscStatus[state as keyof typeof NerscStatus] ?? NerscStatus.UNKNOWN)
  )
}

// Cleans and validates Slurm state string (main helper)
const cleanSlurmState = (
  rawState: string | undefined,
  jobID: string
): NerscStatusEnum => {
  if (!rawState) return NerscStatus.UNKNOWN

  const trimmed = rawState.split(' ')[0].toUpperCase()
  const normalized = normalizeState(trimmed)

  if (Object.values(NerscStatus).includes(normalized)) {
    return normalized
  } else {
    logger.warn(
      `Unknown or unexpected state "${rawState}" (normalized to "${normalized}") for NERSC job ${jobID}`
    )
    return NerscStatus.UNKNOWN
  }
}

const fetchNERSCJobState = async (
  jobID: string
): Promise<INerscInfo | null> => {
  const url = `${config.nerscBaseAPI}/compute/jobs/perlmutter/${jobID}?sacct=true`
  // logger.info(`Fetching state for NERSC job: ${jobID} from URL: ${url}`)

  const token = await ensureValidToken() // Fetch or refresh the token
  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`
  }

  try {
    const response = await axios.get(url, { headers })

    if (response.data.output && response.data.output.length > 0) {
      const jobDetails: JobStatusOutputSacct = response.data.output[0]

      // Log the entire jobDetails object for debugging
      // logger.info(`Job Details for ${jobID}: ${JSON.stringify(jobDetails, null, 2)}`)
      const parseDate = (dateStr?: string): Date => {
        const d = dateStr ? new Date(dateStr) : new Date(NaN)
        return isNaN(d.getTime()) ? new Date(0) : d
      }

      return {
        jobid: jobID,
        state: cleanSlurmState(jobDetails.state, jobID),
        qos: jobDetails.qos || null,
        time_submitted: parseDate(jobDetails.submit),
        time_started: parseDate(jobDetails.start),
        time_completed: parseDate(jobDetails.end)
      }
    } else {
      logger.warn(`No output received for NERSC job: ${jobID}`)
      return null
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      logger.error(`Authorization error for job ${jobID}. Check your token.`)
      throw new Error('Authorization failed. Token might need refresh.')
    } else {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Error fetching state for NERSC job ${jobID}: ${msg}`)
      throw error
    }
  }
}

const handleStateFetchFailure = async (job: IJob) => {
  await updateSingleJobStep(
    job,
    'nersc_job_status',
    'Error',
    'Failed to fetch NERSC job state.'
  )
}

const performJobCleanup = async (DBjob: IJob) => {
  try {
    const jobid = DBjob.nersc?.jobid ?? 'unknown'
    logger.info(`Starting cleanup for job: ${jobid}, current state: COMPLETED`)

    // Perform cleanup tasks
    await copyBilboMDResults(DBjob)
    await prepareBilboMDResults(DBjob)
    await sendBilboMDEmail(DBjob, {
      message: 'Cleanup completed successfully.',
      error: false
    })

    // Update job status to 'Completed'
    DBjob.status = 'Completed'
    DBjob.progress = 100
    logger.info(`Cleanup completed successfully for job ${jobid}`)

    // Save the updated job status
    await DBjob.save()
  } catch (error: unknown) {
    const jobid = DBjob.nersc?.jobid ?? 'unknown'
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Error during cleanup for job ${jobid}: ${msg}`)

    // Mark job as 'Error' and save
    DBjob.status = 'Error'
    await DBjob.save()
  }
}

const calculateProgress = async (steps?: IBilboMDSteps): Promise<number> => {
  if (!steps) return 0

  // Extract all step statuses from the steps object
  const stepStatuses = Object.values(steps)

  // Filter out undefined steps (in case some steps are optional or not defined yet)
  const validSteps = stepStatuses.filter((step) => step !== undefined)

  const totalSteps = validSteps.length

  if (totalSteps === 0) return 0 // Avoid division by zero

  // Count the steps marked as 'Success'
  const completedSteps = validSteps.filter(
    (step) => step?.status === 'Success'
  ).length

  // Calculate the percentage of completed steps
  return Math.round((completedSteps / totalSteps) * 100)
}

const updateSingleJobStep = async (
  DBJob: IJob,
  stepName: keyof IBilboMDSteps,
  status: StepStatusEnum,
  message: string
): Promise<void> => {
  try {
    if (!DBJob.steps) {
      DBJob.steps = {} as IBilboMDSteps
    }
    DBJob.steps[stepName] = { status, message }
    await DBJob.save()
  } catch (error) {
    logger.error(
      `Error updating step status for job ${DBJob.uuid} in step ${stepName}: ${error}`
    )
  }
}

const updateJobStepsFromSlurmStatusFile = async (
  DBJob: IJob
): Promise<void> => {
  try {
    if (!DBJob.steps) {
      DBJob.steps = {} as IBilboMDSteps
    }
    const currentSteps = DBJob.steps
    const UUID = DBJob.uuid
    const contents: string = await getSlurmStatusFile(UUID)
    const lines = contents.split('\n').filter(Boolean) // Filter out empty lines

    // Update steps from the status file
    const updatedSteps = lines.reduce(
      (acc, line) => {
        const [step, status] = line.split(':').map((part) => part.trim())
        if (step in currentSteps) {
          const key = step as keyof IBilboMDSteps
          acc[key] = { status: status as StepStatusEnum, message: status }
        }
        return acc
      },
      { ...currentSteps } as IBilboMDSteps
    )

    // Apply the updated steps to the job
    DBJob.steps = updatedSteps
    await DBJob.save()
  } catch (error) {
    logger.error(`Unable to update job status for ${DBJob._id}: ${error}`)
    throw error
  }
}

export { monitorAndCleanupJobs }
