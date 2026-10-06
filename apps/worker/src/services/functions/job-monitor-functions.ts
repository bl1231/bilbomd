import {
  User,
  IJob,
  IBilboMDSteps,
  StepStatusEnum,
  IStepStatus
} from '@bilbomd/mongodb-schema'
import { Types } from 'mongoose'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import {
  executeNerscScript,
  monitorTaskAtNERSC
} from './nersc-api-functions.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { wantsJobEmails } from '../../helpers/emailPreferences.js'

interface EmailMessage {
  message: string
  error?: boolean
}

const copyBilboMDResults = async (DBjob: IJob) => {
  try {
    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Running',
      'Copying results from PSCRATCH to CFS has started.'
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Running',
      'Copying results from PSCRATCH to CFS has started.'
    )

    const copyID = await executeNerscScript(
      config.scripts.copyFromScratchToCFSScript,
      DBjob.uuid
    )

    const copyResult = await monitorTaskAtNERSC(copyID)
    logger.info(`copyResult: ${JSON.stringify(copyResult)}`)

    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Success',
      'Copying results from PSCRATCH to CFS successful.'
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Success',
      'Copying results from PSCRATCH to CFS successful.'
    )
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Error',
      `Failed to copy BilboMD results from PSCRATCH to CFS: ${errorMessage}`
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Error',
      `Failed to copy BilboMD results from PSCRATCH to CFS: ${errorMessage}`
    )
    logger.error(`Error during copyBilboMDResults job: ${errorMessage}`)
  }
}

const sendBilboMDEmail = async (
  DBjob: IJob,
  message: EmailMessage
): Promise<void> => {
  try {
    // Log the beginning of the process
    await updateSingleJobStep(
      DBjob,
      'email',
      'Running',
      'Cleaning up & sending email has started.'
    )

    // Perform the cleanup job and send email
    await cleanupJob(DBjob, message)

    // Log success
    await updateSingleJobStep(
      DBjob,
      'email',
      'Success',
      'Cleaning up & sending email successful.'
    )

    logger.info(
      `Email sent for job ${DBjob.nersc?.jobid ?? 'unknown'} with message: ${message.message}`
    )
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }

    const statusMessage = `Failed to send email: ${errorMessage}`
    // Update job status to indicate error
    await updateSingleJobStep(DBjob, 'email', 'Error', statusMessage)
    await updateSingleJobStep(DBjob, 'nersc_job_status', 'Error', statusMessage)

    logger.error(`Error during sendBilboMDEmail job: ${errorMessage}`)
  }
}

const cleanupJob = async (
  DBjob: IJob,
  message: EmailMessage
): Promise<void> => {
  try {
    // Update MongoDB job status and completion time
    DBjob.status = 'Completed'
    DBjob.time_completed = new Date()
    await DBjob.save()

    // Skip email for anonymous jobs
    if (!DBjob.user) {
      logger.info(`Skipping email for anonymous job: ${DBjob.uuid}`)
      return
    }

    // Get user ID - handles both ObjectId and populated user object
    const userId =
      DBjob.user instanceof Types.ObjectId ? DBjob.user : DBjob.user._id

    // Retrieve the user email from the associated User model
    const user = await User.findById(userId).lean().exec()
    if (!user) {
      logger.error(`No user found for registered job: ${DBjob.uuid}`)
      return
    }

    // Send job completion email unless the owner turned job emails off
    if (config.sendEmailNotifications && (await wantsJobEmails(user))) {
      sendJobCompleteEmail(
        user.email,
        config.bilbomdUrl,
        DBjob._id.toString(),
        DBjob.title,
        message.error ?? false,
        DBjob.results_token
      )
      logger.info(`email notification sent to ${user.email}`)
    }
  } catch (error) {
    logger.error(`Error in cleanupJob: ${error}`)
    throw error
  }
}

type StepTiming = Pick<
  IStepStatus,
  'started_at' | 'completed_at' | 'duration_ms'
>

// Timing for a step the monitor runs itself, with the same rules as
// buildStepStatusUpdate: Running keeps an existing start, Success and Error
// close the step, anything else clears the timing.
const stepTiming = (
  previous: IStepStatus | undefined,
  status: StepStatusEnum,
  now = new Date()
): StepTiming => {
  const started_at = previous?.started_at
    ? new Date(previous.started_at)
    : undefined
  if (status === 'Running') return { started_at: started_at ?? now }
  if (status !== 'Success' && status !== 'Error') return {}
  return {
    ...(started_at && {
      started_at,
      duration_ms: now.getTime() - started_at.getTime()
    }),
    completed_at: now
  }
}

const updateSingleJobStep = async (
  DBJob: IJob,
  stepName: keyof IBilboMDSteps,
  status: StepStatusEnum,
  message: string,
  // Pass the timing when it is known from elsewhere (e.g. Slurm accounting)
  timing?: StepTiming
): Promise<void> => {
  try {
    if (!DBJob.steps) {
      DBJob.steps = {} as IBilboMDSteps
    }
    DBJob.steps[stepName] = {
      status,
      message,
      ...(timing ?? stepTiming(DBJob.steps[stepName], status))
    }
    await DBJob.save()
  } catch (error) {
    logger.error(
      `Error updating step status for job ${DBJob.uuid} in step ${stepName}: ${error}`
    )
  }
}

export { copyBilboMDResults, sendBilboMDEmail, updateSingleJobStep, stepTiming }
export type { StepTiming }
