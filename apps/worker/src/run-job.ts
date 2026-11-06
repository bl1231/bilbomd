import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Job as BullMQJob, Queue } from 'bullmq'
import mongoose from 'mongoose'
import { config } from './config/config.js'
import { connectDB } from './helpers/db.js'
import { getErrorMessage } from './helpers/errors.js'
import { JobCancelledError } from './helpers/jobCancellation.js'
import { configureJobEvents, flushJobEvents } from './helpers/jobEvents.js'
import { logger } from './helpers/loggers.js'
import { redis } from './queues/redisConn.js'
import { WorkerJob } from './types/jobtypes.js'
import { bilboMdHandler } from './workerHandlers/bilboMdHandler.js'
import { multiMdHandler } from './workerHandlers/multiMdHandler.js'

// Runs one BilboMD job to completion in this process, then exits. A
// dispatcher that has already taken the job off its BullMQ queue starts this
// in a separate pod (e.g. a Kubernetes Job), so the job runs the same
// pipeline code as the local worker, against the same MongoDB and job
// directory, without a long-lived worker holding its CPUs or GPU.
//
//   node dist/run-job.js <queue> <bullmq-job-id>
//
// The BullMQ job stays active, and locked, in the dispatcher. This process
// only loads it to read its data and report progress and log lines, which
// BullMQ allows without the lock. The dispatcher, not this process, reports a
// failure (the worker's 'failed' event), so a failure here exits non-zero
// and leaves a short reason in the termination message.

export const RUNNABLE_QUEUES = ['bilbomd', 'multimd'] as const
export type RunnableQueue = (typeof RUNNABLE_QUEUES)[number]

export const EXIT_CODES = {
  OK: 0,
  FAILED: 1,
  USAGE: 2,
  CANCELLED: 3
} as const
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

// Kubernetes shows the contents of this file as the container's termination
// message, so the dispatcher can say why a job failed.
const TERMINATION_MESSAGE_PATH =
  process.env.TERMINATION_MESSAGE_PATH || '/dev/termination-log'
// Kubernetes keeps at most 4096 bytes of it
const MAX_TERMINATION_MESSAGE_LENGTH = 4000

const USAGE = `Usage: run-job <${RUNNABLE_QUEUES.join('|')}> <bullmq-job-id>`

type JobHandler = (
  job: BullMQJob<WorkerJob>,
  token?: string,
  signal?: AbortSignal
) => Promise<void>

const HANDLERS: Record<RunnableQueue, JobHandler> = {
  bilbomd: bilboMdHandler,
  multimd: multiMdHandler
}

export interface RunJobArgs {
  queueName: RunnableQueue
  jobId: string
}

export const parseArgs = (argv: string[]): RunJobArgs => {
  const [queueName, jobId, ...rest] = argv
  if (!queueName || !jobId || rest.length > 0) {
    throw new Error(USAGE)
  }
  if (!(RUNNABLE_QUEUES as readonly string[]).includes(queueName)) {
    throw new Error(`Unknown queue "${queueName}". ${USAGE}`)
  }
  return { queueName: queueName as RunnableQueue, jobId }
}

export const writeTerminationMessage = async (
  message: string
): Promise<void> => {
  try {
    await writeFile(
      TERMINATION_MESSAGE_PATH,
      message.slice(0, MAX_TERMINATION_MESSAGE_LENGTH)
    )
  } catch {
    // Not running in a Kubernetes container (no termination log); the
    // message is in the log either way
  }
}

const usageError = async (message: string): Promise<ExitCode> => {
  logger.error(message)
  await writeTerminationMessage(message)
  return EXIT_CODES.USAGE
}

// Loads the BullMQ job and runs it with its queue's handler. Returns the exit
// code instead of exiting, so it can be tested.
export const runJob = async (
  { queueName, jobId }: RunJobArgs,
  signal: AbortSignal
): Promise<ExitCode> => {
  // A job pod must run the pipeline itself; any other backend would hand it
  // on again (e.g. submit it to NERSC)
  if (config.executionBackend !== 'local') {
    return usageError(
      `run-job needs EXECUTION_BACKEND=local, not "${config.executionBackend}"`
    )
  }

  const queue = new Queue(queueName, { connection: redis })
  try {
    const job = (await BullMQJob.fromId(queue, jobId)) as
      BullMQJob<WorkerJob> | undefined
    if (!job) {
      return await usageError(
        `No BullMQ job ${jobId} in the ${queueName} queue`
      )
    }
    if (job.finishedOn) {
      return await usageError(
        `BullMQ job ${jobId} in the ${queueName} queue has already finished`
      )
    }

    logger.info(`run-job: running ${queueName} job ${jobId} (${job.data.type})`)
    try {
      await HANDLERS[queueName](job, undefined, signal)
    } catch (error) {
      const message = getErrorMessage(error)
      await writeTerminationMessage(message)
      if (error instanceof JobCancelledError) {
        logger.warn(`run-job: ${queueName} job ${jobId} cancelled: ${message}`)
        return EXIT_CODES.CANCELLED
      }
      logger.error(`run-job: ${queueName} job ${jobId} failed: ${message}`)
      return EXIT_CODES.FAILED
    }
    logger.info(`run-job: ${queueName} job ${jobId} finished`)
    return EXIT_CODES.OK
  } finally {
    await queue.close()
  }
}

const closeConnections = async (): Promise<void> => {
  // Publish the job's last changes before Redis goes away
  try {
    await flushJobEvents()
  } catch (error) {
    logger.warn(
      `run-job: publishing job events failed: ${getErrorMessage(error)}`
    )
  }
  configureJobEvents(null)
  try {
    await mongoose.disconnect()
  } catch (error) {
    logger.warn(`run-job: closing MongoDB failed: ${getErrorMessage(error)}`)
  }
  try {
    await redis.quit()
  } catch (error) {
    logger.warn(`run-job: closing Redis failed: ${getErrorMessage(error)}`)
  }
}

export const main = async (argv: string[]): Promise<ExitCode> => {
  let args: RunJobArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    return usageError(getErrorMessage(error))
  }

  // Deleting the Kubernetes Job (a user cancelling the job) sends SIGTERM.
  // Abort the pipeline so its child processes are killed and the job is
  // reported as cancelled, not failed.
  const controller = new AbortController()
  const cancelOn = (name: NodeJS.Signals) => () => {
    logger.warn(`run-job: ${name} received, cancelling the job`)
    controller.abort(name)
  }
  const onSigterm = cancelOn('SIGTERM')
  const onSigint = cancelOn('SIGINT')
  process.once('SIGTERM', onSigterm)
  process.once('SIGINT', onSigint)

  // Tell the backend (and the UI) when the job changes, as worker.ts does
  configureJobEvents(redis)

  try {
    await connectDB(controller.signal)
    return await runJob(args, controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      // Cancelled before the job started (e.g. while MongoDB was unreachable)
      const message = `Job cancelled before it started: ${String(controller.signal.reason)}`
      logger.warn(`run-job: ${message}`)
      await writeTerminationMessage(message)
      return EXIT_CODES.CANCELLED
    }
    const message = `run-job: ${getErrorMessage(error)}`
    logger.error(message)
    await writeTerminationMessage(message)
    return EXIT_CODES.FAILED
  } finally {
    process.off('SIGTERM', onSigterm)
    process.off('SIGINT', onSigint)
    await closeConnections()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
