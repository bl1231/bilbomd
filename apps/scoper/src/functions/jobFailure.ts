import { Job as BullMQJob, UnrecoverableError } from 'bullmq'
import { BilboMdScoperJob } from '@bilbomd/mongodb-schema'
import type {
  IBilboMDScoperJob,
  IBilboMDSteps,
  IUser
} from '@bilbomd/mongodb-schema'
import { config } from '../config/config.js'
import { logger } from '../helpers/loggers.js'
import { sendJobCompleteEmail } from '../helpers/mailer.js'
import { wantsJobEmails } from '../helpers/emailPreferences.js'
import { notifyJobChanged } from '../helpers/jobEvents.js'
import { updateStepStatus } from '../mongo-utils.js'
import { recordWorkerUsageEvent, buildContext } from './usageEvents.js'

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

// BullMQ retries a failed job until it has used all its attempts, unless the
// error is unrecoverable (see Job.shouldRetryJob). Call this from the worker's
// 'failed' event, where attemptsMade already counts the failed attempt. The
// attempts come from the job itself (set by the backend when it enqueues), not
// from this service's environment, so the two can't disagree.
export const isFinalAttempt = (MQjob: BullMQJob, error: Error): boolean =>
  error instanceof UnrecoverableError ||
  error.name === 'UnrecoverableError' ||
  MQjob.attemptsMade >= (MQjob.opts.attempts ?? 1)

// Steps the log parser left Running when SCOPER stopped
const runningSteps = (job: IBilboMDScoperJob): (keyof IBilboMDSteps)[] => {
  const steps = job.toObject().steps as
    Record<string, { status?: string } | undefined> | undefined
  return Object.entries(steps ?? {})
    .filter(([, step]) => step?.status === 'Running')
    .map(([name]) => name as keyof IBilboMDSteps)
}

const sendJobFailedEmail = async (
  job: IBilboMDScoperJob
): Promise<string | undefined> => {
  if (!config.sendEmailNotifications) return undefined
  // Anonymous jobs have no one to email
  const email = (job.user as IUser | undefined)?.email
  if (!email || !(await wantsJobEmails(job.user))) return undefined
  sendJobCompleteEmail(
    email,
    config.bilbomdUrl,
    job._id.toString(),
    job.title,
    true,
    job.results_token
  )
  return email
}

// Reports a SCOPER job whose BullMQ run failed, once it won't be retried:
// marks the step it stopped in and the job as Error (otherwise both stay
// Running forever), records a job_failed usage event, and emails the owner.
// Never throws: it runs from the worker's 'failed' event.
export const reportFailedJob = async (
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
    const job = await BilboMdScoperJob.findById(jobid).populate('user').exec()
    if (!job) {
      logger.info(`Not reporting failed job ${jobid}: it no longer exists`)
      return
    }

    const stopped = runningSteps(job)
    for (const step of stopped) {
      await updateStepStatus(job, step, {
        status: 'Error',
        message: error.message
      })
    }
    if (job.status !== 'Error') {
      job.status = 'Error'
      await job.save()
      notifyJobChanged(job)
    }

    await recordWorkerUsageEvent({
      uuid: job.uuid,
      jobId: job._id,
      pipeline: 'scoper',
      eventType: 'job_failed',
      status: 'Error',
      durationMs: job.time_started
        ? Date.now() - new Date(job.time_started).getTime()
        : undefined,
      context: buildContext({
        access_mode: job.access_mode,
        user: job.user,
        public_id: job.public_id,
        client_ip_hash: job.client_ip_hash
      }),
      metadata: {
        stage: 'worker',
        step: stopped[0] ?? 'scoper',
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
