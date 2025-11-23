import { logger } from './helpers/loggers.js'
import { Job as BullMQJob } from 'bullmq'
import {
  IJob,
  User,
  IUser,
  IStepStatus,
  IBilboMDScoperJob
} from '@bilbomd/mongodb-schema'
import { sendJobCompleteEmail } from './helpers/mailer.js'
import { config } from './config/config.js'
import { updateStepStatus } from './mongo-utils.js'
import { Types } from 'mongoose'

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

// Mark job as completed
const markJobAsCompleted = async (DBjob: IJob): Promise<void> => {
  DBjob.status = 'Completed'
  DBjob.time_completed = new Date()
  await DBjob.save()
}

const initializeJob = async (MQJob: BullMQJob, DBjob: IBilboMDScoperJob) => {
  try {
    await MQJob.clearLogs()
    DBjob.status = 'Running'
    const now = new Date()
    DBjob.time_started = now
    await DBjob.save()
  } catch (error) {
    logger.error(`Error in initializeJob: ${getErrorMessage(error)}`)
    throw error
  }
}

const cleanupJob = async (MQjob: BullMQJob, DBjob: IBilboMDScoperJob) => {
  try {
    // Mark job as completed in the database
    await markJobAsCompleted(DBjob)

    // Fetch user associated with the job (may be null for anonymous jobs)
    const user = await fetchJobUser(DBjob)

    if (!user) {
      logger.info(
        `cleanupJob: no user associated with job uuid=${DBjob.uuid}, skipping email notification`
      )
      DBjob.progress = 100
      await DBjob.save()
      return
    }

    // Handle email notifications for jobs with a valid user
    await handleJobEmailNotification(MQjob, DBjob, user)
  } catch (error) {
    logger.error(`Error in cleanupJob: ${getErrorMessage(error)}`)
    throw error
  }
}

// Fetch user associated with the job
const fetchJobUser = async (DBjob: IJob): Promise<IUser | null> => {
  if (!DBjob.user) {
    return null
  }
  if (typeof DBjob.user === 'object' && '_id' in DBjob.user) {
    // Already populated IUser document
    return DBjob.user as IUser
  }
  if (!Types.ObjectId.isValid(DBjob.user)) {
    return null
  }
  return User.findById(DBjob.user).lean<IUser>().exec()
}

// Handle email notifications
const handleJobEmailNotification = async (
  MQjob: BullMQJob,
  DBjob: IJob,
  user: IUser
): Promise<void> => {
  if (config.sendEmailNotifications) {
    let status: IStepStatus = {
      status: 'Running',
      message: `Sending email to: ${user.email}`
    }
    await updateStepStatus(DBjob, 'email', status)

    try {
      sendJobCompleteEmail(
        user.email,
        config.bilbomdUrl,
        DBjob.id,
        DBjob.title,
        false
      )
      logger.info(`Email notification sent to ${user.email}`)
      await MQjob.log(`Email notification sent to ${user.email}`)

      status = {
        status: 'Success',
        message: `Email sent to: ${user.email}`
      }
      await updateStepStatus(DBjob, 'email', status)
    } catch (emailError) {
      logger.error(
        `Failed to send email to ${user.email}: ${getErrorMessage(emailError)}`
      )
      status = {
        status: 'Error',
        message: `Failed to send email: ${getErrorMessage(emailError)}`
      }
      await updateStepStatus(DBjob, 'email', status)
    }
  } else {
    logger.info(
      `Skipping email notification for job uuid=${DBjob.uuid} (email notifications disabled)`
    )
  }
}

export { initializeJob, cleanupJob }
