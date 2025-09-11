import { Worker } from 'bullmq'
import { Job as MongoJob, MultiJob } from '@bl1231/bilbomd-mongodb-schema'
import path from 'path'
import fs from 'fs-extra'
import { logger } from '../middleware/loggers.js'

const uploadFolder = path.join(process.env.DATA_VOL ?? '')

const connection = {
  host: 'redis',
  port: 6379
}

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

  throw new Error(`Failed to remove directory ${jobDir} after ${maxAttempts} attempts`)
}

const deleteWorker = new Worker(
  'delete-bilbomd',
  async (job) => {
    const mongoId = job.data.mongoId as string

    const jobDoc = await MongoJob.findById(mongoId)
    const multiJobDoc = await MultiJob.findById(mongoId)

    if (!jobDoc && !multiJobDoc) {
      throw new Error(`No Job or MultiJob found with ID ${mongoId}`)
    }

    if (jobDoc) {
      await jobDoc.deleteOne()
      await removeJobDirectory(jobDoc.uuid)
      logger.info(`Deleted Job: '${jobDoc.title}' with UUID ${jobDoc.uuid}`)
    }

    if (multiJobDoc) {
      await multiJobDoc.deleteOne()
      await removeJobDirectory(multiJobDoc.uuid)
      logger.info(
        `Deleted MultiJob: '${multiJobDoc.title}' with UUID ${multiJobDoc.uuid}`
      )
    }

    return { status: 'deleted', mongoId }
  },
  { connection }
)

export default deleteWorker
