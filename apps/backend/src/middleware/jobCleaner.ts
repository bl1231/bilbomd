import mongoose from 'mongoose'
import { RootFilterQuery } from 'mongoose'
import { connectDB } from '../config/dbConn.js'
import path from 'path'
import fs from 'fs-extra'
import { Job, IJob } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from './loggers.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

export const deleteOldJobs = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      connectDB()
    }

    const maxAge = 30 * 24 * 60 * 60
    const thresholdDate = new Date(Date.now() - maxAge * 1000)

    const oldJobs = await Job.find({
      createdAt: { $lt: thresholdDate }
    } as RootFilterQuery<IJob>)
    const numOldJobs = oldJobs.length

    if (numOldJobs > 0) {
      logger.warn(`Found ${numOldJobs} jobs older than 1 month.`)
    }

    for (const job of oldJobs) {
      logger.warn(
        `Preparing to delete: ${job.title} user: ${job.user} completed: ${job.time_completed}`
      )
      const jobDir = path.join(uploadFolder, job.uuid)

      try {
        const exists = await fs.pathExists(jobDir)
        if (!exists) {
          logger.warn(`Directory ${jobDir} not found on disk`)
        } else {
          await fs.remove(jobDir)
        }
      } catch (error) {
        logger.error(`Error deleting job directory: ${jobDir} ${error}`)
      }
    }

    const deleteResult = await Job.deleteMany({
      createdAt: { $lt: thresholdDate }
    } as RootFilterQuery<IJob>)
    const deletedJobsCount = deleteResult.deletedCount
    logger.warn(`Deleted ${deletedJobsCount} jobs from MongoDB`)
  } catch (error) {
    logger.error(`Error deleting old jobs: ${error}`)
  }
}
