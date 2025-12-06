import {
  User,
  IJob,
  IBilboMDSteps,
  StepStatusEnum
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import {
  executeNerscScript,
  monitorTaskAtNERSC
} from './nersc-api-functions.js'
import {
  isBilboMDPDBJob,
  isBilboMDCRDJob,
  isBilboMDAutoJob,
  isBilboMDAlphaFoldJob
} from './bilbomd-step-functions-nersc.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { prepareResults } from './prepare-results.js'

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

const prepareBilboMDResults = async (DBjob: IJob): Promise<void> => {
  try {
    await updateSingleJobStep(
      DBjob,
      'results',
      'Running',
      'Gathering BilboMD job results has started.'
    )

    // Ensure DBjob is one of the acceptable types before calling prepareResults
    if (
      isBilboMDCRDJob(DBjob) ||
      isBilboMDPDBJob(DBjob) ||
      isBilboMDAutoJob(DBjob) ||
      isBilboMDAlphaFoldJob(DBjob)
    ) {
      await prepareResults(DBjob)
      await updateSingleJobStep(
        DBjob,
        'results',
        'Success',
        'BilboMD job results gathered successfully.'
      )
    } else {
      throw new Error('Invalid job type')
    }
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateSingleJobStep(
      DBjob,
      'results',
      'Error',
      `Failed to gather BilboMD results: ${errorMessage}`
    )
    logger.error(`Error during prepareBilboMDResults job: ${errorMessage}`)
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

    // Retrieve the user email from the associated User model
    const user = await User.findById(DBjob.user).lean().exec()
    if (!user) {
      logger.error(`No user found for: ${DBjob.uuid}`)
      return
    }

    // Send job completion email and log the notification
    if (config.sendEmailNotifications) {
      sendJobCompleteEmail(
        user.email,
        config.bilbomdUrl,
        DBjob.id,
        DBjob.title,
        message.error ?? false
      )
      logger.info(`email notification sent to ${user.email}`)
    }
  } catch (error) {
    logger.error(`Error in cleanupJob: ${error}`)
    throw error
  }
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

export { copyBilboMDResults, prepareBilboMDResults, sendBilboMDEmail }
