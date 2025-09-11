import {
  Job as DBJob,
  IJob,
  IBilboMDSteps,
  StepStatusEnum,
  NerscStatus,
  NerscStatusEnum,
  JobStatus,
  INerscInfo
} from '@bl1231/bilbomd-mongodb-schema'
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

interface MonitoringError {
  message: string
}

const fetchIncompleteJobs = async (): Promise<IJob[]> => {
  return DBJob.find({
    status: { $ne: JobStatus.Completed }, // Jobs with a non-Completed status
    cleanup_in_progress: false,
    'nersc.state': { $ne: null } // Exclude jobs where nersc.state is undefined or null
  }).exec()
}

const queryNERSCForJobState = async (job: IJob): Promise<INerscInfo | null> => {
  try {
    const nerscState = await fetchNERSCJobState(job.nersc?.jobid)
    if (!nerscState) {
      logger.warn(`Failed to fetch NERSC state for job ${job.nersc?.jobid}.`)
      await handleStateFetchFailure(job)
      return null
    }
    return nerscState
  } catch (error) {
    logger.error(`Error querying NERSC for job ${job.nersc?.jobid}: ${error.message}`)
    await handleMonitoringError(job, error)
    return null
  }
}

const updateJobStateInMongoDB = async (
  job: IJob,
  nerscState: INerscInfo
): Promise<void> => {
  try {
    await updateJobNerscState(job, nerscState) // Update state in MongoDB
    const progress = await calculateProgress(job.toObject().steps) // Calculate progress
    job.progress = progress
    logger.info(
      `Job: ${job.nersc.jobid} State: ${job.nersc.state} Progress: ${progress}%`
    )
    await job.save() // Save the updated job
  } catch (error) {
    logger.error(`Error updating job ${job.nersc?.jobid} in MongoDB: ${error.message}`)
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

    logger.info(`Job ${job.nersc?.jobid} is COMPLETED. Initiating cleanup.`)
    job.cleanup_in_progress = true
    await job.save()

    await performJobCleanup(job)

    job.cleanup_in_progress = false
    await job.save()
  } catch (error) {
    logger.error(`Error during cleanup for job ${job.nersc?.jobid}: ${error.message}`)

    // Make sure to reset the flag so it's not stuck forever
    job.cleanup_in_progress = false
    await job.save()
  }
}

const markJobAsFailed = async (job: IJob) => {
  try {
    logger.info(`Marking job ${job.nersc?.jobid} as FAILED`)
    job.status = 'Failed'
    await job.save()
  } catch (err) {
    logger.error(`Error marking job ${job.nersc?.jobid} as FAILED: ${err.message}`)
  }
}

const markJobAsCancelled = async (job: IJob) => {
  try {
    logger.info(`Marking job ${job.nersc?.jobid} as CANCELLED`)
    job.status = 'Cancelled'
    await job.save()
  } catch (err) {
    logger.error(`Error marking job ${job.nersc?.jobid} as CANCELLED: ${err.message}`)
  }
}

const markJobAsPending = async (job: IJob) => {
  try {
    job.status = 'Pending'
    await job.save()
  } catch (err) {
    logger.error(`Error marking job ${job.nersc?.jobid} as PENDING: ${err.message}`)
  }
}

const markJobAsRunning = async (job: IJob) => {
  try {
    job.status = 'Running'
    await job.save()
  } catch (err) {
    logger.error(`Error marking job ${job.nersc?.jobid} as RUNNING: ${err.message}`)
  }
}

const monitorAndCleanupJobs = async () => {
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
          logger.warn(`Job ${job.nersc?.jobid} failed with state: ${nerscState.state}`)
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
    logger.error(`Error during job monitoring: ${error.message}`)
  }
}

const handleMonitoringError = async (
  job: IJob,
  error: MonitoringError
): Promise<void> => {
  await updateSingleJobStep(job, 'nersc_job_status', 'Error', `Error: ${error.message}`)
  job.status = 'Error'
  await job.save()
}

const updateJobNerscState = async (job: IJob, nerscState: INerscInfo) => {
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
    map[state] || (NerscStatus[state as keyof typeof NerscStatus] ?? NerscStatus.UNKNOWN)
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

const fetchNERSCJobState = async (jobID: string): Promise<INerscInfo> => {
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
      const parseDate = (dateStr: string | undefined): Date | null => {
        const parsedDate = dateStr ? new Date(dateStr) : null
        return parsedDate instanceof Date && !isNaN(parsedDate.getTime())
          ? parsedDate
          : null
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
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      logger.error(`Authorization error for job ${jobID}. Check your token.`)
      throw new Error('Authorization failed. Token might need refresh.')
    } else {
      logger.error(`Error fetching state for NERSC job ${jobID}: ${error.message}`)
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
    logger.info(
      `Starting cleanup for job: ${DBjob.nersc.jobid}, current state: COMPLETED`
    )

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
    logger.info(`Cleanup completed successfully for job ${DBjob.nersc.jobid}`)

    // Save the updated job status
    await DBjob.save()
  } catch (error) {
    // Handle unexpected errors during cleanup
    logger.error(`Error during cleanup for job ${DBjob.nersc.jobid}: ${error.message}`)

    // Mark job as 'Error' and save
    DBjob.status = 'Error'
    await DBjob.save()
  }
}

const calculateProgress = async (steps: IBilboMDSteps): Promise<number> => {
  if (!steps) return 0

  // Extract all step statuses from the steps object
  const stepStatuses = Object.values(steps)

  // Filter out undefined steps (in case some steps are optional or not defined yet)
  const validSteps = stepStatuses.filter((step) => step !== undefined)

  const totalSteps = validSteps.length

  if (totalSteps === 0) return 0 // Avoid division by zero

  // Count the steps marked as 'Success'
  const completedSteps = validSteps.filter((step) => step?.status === 'Success').length

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
    DBJob.steps[stepName] = { status, message }
    await DBJob.save()
  } catch (error) {
    logger.error(
      `Error updating step status for job ${DBJob.uuid} in step ${stepName}: ${error}`
    )
  }
}

const updateJobStepsFromSlurmStatusFile = async (DBJob: IJob): Promise<void> => {
  try {
    const UUID = DBJob.uuid
    const contents: string = await getSlurmStatusFile(UUID)
    const lines = contents.split('\n').filter(Boolean) // Filter out empty lines

    // Update steps from the status file
    const updatedSteps = lines.reduce(
      (acc, line) => {
        const [step, status] = line.split(':').map((part) => part.trim())
        if (step in DBJob.steps) {
          const key = step as keyof IBilboMDSteps
          acc[key] = { status: status as StepStatusEnum, message: status }
        }
        return acc
      },
      { ...DBJob.steps } as IBilboMDSteps
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
