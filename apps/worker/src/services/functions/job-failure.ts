import { Job as BullMQJob, UnrecoverableError } from 'bullmq'
import { Types } from 'mongoose'
import { Job, MultiJob, User } from '@bilbomd/mongodb-schema'
import type {
  IJob,
  IMultiJob,
  IUser,
  IUsageEventContext
} from '@bilbomd/mongodb-schema'
import { discriminatorToPipeline } from '@bilbomd/md-utils'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { getErrorMessage } from '../../helpers/errors.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { notifyJobChanged } from '../../helpers/jobEvents.js'
import { JobCancelledError } from '../../helpers/jobCancellation.js'
import { wantsJobEmails } from '../../helpers/emailPreferences.js'
import { recordWorkerUsageEvent, buildContext } from './usage-events.js'

type FailureQueue = 'bilbomd' | 'multimd'

// BullMQ retries a failed job until it has used all its attempts, unless the
// error is unrecoverable (see Job.shouldRetryJob). Call this from a worker's
// 'failed' event, where attemptsMade already counts the failed attempt.
export const isFinalAttempt = (MQjob: BullMQJob, error: Error): boolean =>
  error instanceof UnrecoverableError ||
  error.name === 'UnrecoverableError' ||
  MQjob.attemptsMade >= (MQjob.opts.attempts ?? 1)

// The job owner's email. Jobs loaded without populate('user') hold an
// ObjectId; anonymous jobs have no user (Mongoose gives them an empty object).
const ownerEmail = async (
  user: IUser | Types.ObjectId | undefined
): Promise<string | undefined> => {
  if (user instanceof Types.ObjectId) {
    const found = await User.findById(user).lean<IUser>().exec()
    return found?.email
  }
  return typeof user?.email === 'string' ? user.email : undefined
}

// Emails the job's owner that the job failed. Returns the address it was
// sent to, or undefined when there is no one to email, emails are off, or
// the owner turned job emails off.
export const sendJobFailedEmail = async (
  job: IJob | IMultiJob
): Promise<string | undefined> => {
  if (!config.sendEmailNotifications) return undefined
  const email = await ownerEmail(job.user)
  if (!email || !(await wantsJobEmails(job.user))) return undefined
  sendJobCompleteEmail(
    email,
    config.bilbomdUrl,
    job._id.toString(),
    job.title,
    true,
    'results_token' in job ? job.results_token : undefined
  )
  return email
}

// The first step marked Error (set by handleError), if any
const failedStep = (job: IJob | IMultiJob): string | undefined => {
  const steps = job.toObject().steps as
    Record<string, { status?: string } | undefined> | undefined
  return Object.entries(steps ?? {}).find(
    ([, step]) => step?.status === 'Error'
  )?.[0]
}

interface FailedJob {
  doc: IJob | IMultiJob
  pipeline: ReturnType<typeof discriminatorToPipeline> | 'multi'
  context: IUsageEventContext
}

const loadFailedJob = async (
  queue: FailureQueue,
  jobid: string
): Promise<FailedJob | null> => {
  if (queue === 'multimd') {
    const doc = await MultiJob.findById(jobid).populate('user').exec()
    // Multi jobs are only submitted by signed-in users
    return doc
      ? {
          doc,
          pipeline: 'multi',
          context: buildContext({ access_mode: 'user', user: doc.user })
        }
      : null
  }
  const doc = await Job.findById(jobid).populate('user').exec()
  return doc
    ? {
        doc,
        pipeline: discriminatorToPipeline(doc.__t),
        context: buildContext({
          access_mode: doc.access_mode,
          user: doc.user,
          public_id: doc.public_id,
          client_ip_hash: doc.client_ip_hash
        })
      }
    : null
}

// Reports a job whose BullMQ run failed, once it won't be retried: marks it
// Error (a failure outside a pipeline step leaves it Running), records a
// job_failed usage event, and emails the owner. A cancelled job records
// job_cancelled instead, with no email. Never throws: it runs from the
// worker's 'failed' event.
export const reportFailedJob = async (
  queue: FailureQueue,
  MQjob: BullMQJob | undefined,
  error: Error
): Promise<void> => {
  if (!MQjob) return
  try {
    if (!isFinalAttempt(MQjob, error)) {
      logger.info(
        `Job ${MQjob.id} failed attempt ${MQjob.attemptsMade} of ${MQjob.opts.attempts}; BullMQ will retry it`
      )
      return
    }

    const jobid = (MQjob.data as { jobid?: string } | undefined)?.jobid
    if (!jobid) return
    const failed = await loadFailedJob(queue, jobid)
    if (!failed) {
      // Deleting a job cancels it, and by then it may already be gone
      logger.info(`Not reporting failed job ${jobid}: it no longer exists`)
      return
    }
    const { doc: job, pipeline, context } = failed

    if (error instanceof JobCancelledError) {
      await recordWorkerUsageEvent({
        uuid: job.uuid,
        jobId: job._id,
        pipeline,
        eventType: 'job_cancelled',
        status: 'Cancelled',
        context,
        metadata: { stage: 'worker', reason: error.message }
      })
      return
    }

    if (job.status !== 'Error') {
      job.status = 'Error'
      await job.save()
      notifyJobChanged(job)
    }

    await recordWorkerUsageEvent({
      uuid: job.uuid,
      jobId: job._id,
      pipeline,
      eventType: 'job_failed',
      status: 'Error',
      durationMs: job.time_started
        ? Date.now() - new Date(job.time_started).getTime()
        : undefined,
      context,
      metadata: {
        stage: 'worker',
        step: failedStep(job),
        error: error.message,
        attempts: MQjob.attemptsMade
      }
    })

    const emailedTo = await sendJobFailedEmail(job)
    if (emailedTo) {
      logger.info(`Job failure email sent to ${emailedTo} for ${job.uuid}`)
    }
  } catch (reportError) {
    logger.error(
      `Failed to report failed job ${MQjob.id}: ${getErrorMessage(reportError)}`
    )
  }
}
