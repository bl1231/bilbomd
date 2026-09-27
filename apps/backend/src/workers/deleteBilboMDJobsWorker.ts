import { Worker, Job } from 'bullmq'
import { Job as MongoJob, MultiJob } from '@bilbomd/mongodb-schema'
import path from 'path'
import fs from 'fs-extra'
import { logger } from '../middleware/loggers.js'
import { getEnvVar } from '../config/config.js'
import { redis as connection } from '../queues/redisConn.js'
import { requestJobCancellation } from '../queues/cancelJob.js'
import { jobEventOwnerId } from '@bilbomd/bilbomd-types'
import { publishJobEvent } from '../services/jobEvents.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}

const removeJobDirectory = async (uuid: string) => {
  const jobDir = path.join(uploadFolder, uuid)

  const exists = await fs.pathExists(jobDir)
  if (!exists) {
    logger.warn(`Directory not found for UUID: ${uuid}`)
    return
  }

  const maxAttempts = 10
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      logger.info(`Attempt ${attempt + 1} to remove ${jobDir}`)
      await fs.remove(jobDir)
      logger.info(`Removed ${jobDir}`)
      return
    } catch (err: unknown) {
      if (
        isErrnoException(err) &&
        err.code &&
        ['ENOTEMPTY', 'EBUSY'].includes(err.code)
      ) {
        logger.warn(`Attempt ${attempt + 1} failed: ${err.code}. Retrying...`)
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }

  throw new Error(
    `Failed to remove directory ${jobDir} after ${maxAttempts} attempts`
  )
}

export const processDeleteJob = async (job: Job<{ mongoId: string }>) => {
  const mongoId = job.data.mongoId

  const jobDoc = await MongoJob.findById(mongoId)
  const multiJobDoc = await MultiJob.findById(mongoId)

  if (!jobDoc && !multiJobDoc) {
    throw new Error(`No Job or MultiJob found with ID ${mongoId}`)
  }

  // Stop the job first if it is queued or running, so a worker isn't still
  // writing into the directory we're about to remove. Failing to cancel
  // shouldn't block the delete.
  try {
    await requestJobCancellation(mongoId, 'job deleted by user')
  } catch (error) {
    logger.error(`Failed to request cancellation of ${mongoId}: ${error}`)
  }

  // The job is gone for the UI once its document is: tell it before the
  // (possibly slow) directory removal
  const announceDeleted = (user: unknown) =>
    publishJobEvent(connection, {
      jobId: mongoId,
      ownerId: jobEventOwnerId(user),
      kind: 'deleted'
    })

  if (jobDoc) {
    await jobDoc.deleteOne()
    await announceDeleted(jobDoc.user)
    await removeJobDirectory(jobDoc.uuid)
    logger.info(`Deleted Job: '${jobDoc.title}' with UUID ${jobDoc.uuid}`)
  }

  if (multiJobDoc) {
    await multiJobDoc.deleteOne()
    await announceDeleted(multiJobDoc.user)
    await removeJobDirectory(multiJobDoc.uuid)
    logger.info(
      `Deleted MultiJob: '${multiJobDoc.title}' with UUID ${multiJobDoc.uuid}`
    )
  }

  return { status: 'deleted', mongoId }
}

// After the last attempt fails, tell the UI the job is still there so it
// stops showing it as being deleted. If its document is already gone (only
// the directory removal failed), 'deleted' was announced and there's nothing
// to undo.
export const handleDeleteFailed = async (
  job: Job<{ mongoId: string }> | undefined,
  error: Error
) => {
  if (!job) return
  const attempts = job.opts.attempts ?? 1
  if (job.attemptsMade < attempts) return

  const mongoId = job.data.mongoId
  logger.error(`Giving up deleting job ${mongoId}: ${error.message}`)
  const doc =
    (await MongoJob.findById(mongoId)) ?? (await MultiJob.findById(mongoId))
  if (!doc) return

  await publishJobEvent(connection, {
    jobId: mongoId,
    ownerId: jobEventOwnerId(doc.user),
    kind: 'delete_failed'
  })
}

const deleteWorker = new Worker('delete-bilbomd', processDeleteJob, {
  connection
})
deleteWorker.on('failed', (job, error) => {
  handleDeleteFailed(job, error).catch((e) =>
    logger.error(`Error handling failed deletion: ${e}`)
  )
})

export default deleteWorker
