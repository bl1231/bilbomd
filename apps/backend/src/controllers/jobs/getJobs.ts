import { logger } from '../../middleware/loggers.js'
import {
  Job,
  IJob,
  User,
  IUser,
  MultiJob,
  IMultiJob
} from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import { buildBilboMDJobDTO, buildMultiJobDTO } from './utils/jobDTOMapper.js'

const getAllJobs = async (req: Request, res: Response) => {
  try {
    const username = req.user as string
    const roles = req.roles as string[]

    // Validate required request properties
    if (!username) {
      res.status(400).json({ message: 'Username is required' })
      return
    }

    if (!roles || !Array.isArray(roles)) {
      res.status(400).json({ message: 'User roles are required' })
      return
    }

    // Determine if the user is an admin or manager based on their roles
    const isAdmin = roles.includes('Admin')
    const isManager = roles.includes('Manager')

    let jobFilter = {}
    if (!isAdmin && !isManager) {
      logger.info(
        `User ${username} is not an Admin or Manager - filtering by username`
      )
      const user = await User.findOne({ username }).lean()

      if (!user) {
        res.status(404).json({ message: 'User not found' })
        return
      }

      // Use the user's ObjectId to filter jobs
      jobFilter = { user: user._id }
    }

    // Fetch jobs from both Job and MultiJob collections
    const [DBjobs, DBmultiJobs] = await Promise.all([
      Job.find(jobFilter).populate('user').lean<IJob[]>().exec(),
      MultiJob.find(jobFilter).populate('user').lean<IMultiJob[]>().exec()
    ])

    // Combine both job types
    const allJobs: BilboMDJobDTO[] = []

    // Map Job collection docs → DTOs
    for (const mongoJob of DBjobs) {
      try {
        if (!mongoJob || !mongoJob._id) {
          logger.warn('Skipping invalid job document without ID')
          continue
        }

        const userObj =
          typeof mongoJob.user === 'object'
            ? (mongoJob.user as IUser)
            : undefined

        const dto = buildBilboMDJobDTO({
          jobId: mongoJob._id.toString(),
          mongo: mongoJob,
          username: userObj?.username || 'anonymous'
        })

        allJobs.push(dto)
      } catch (dtoError) {
        logger.error(`Failed to build DTO for job ${mongoJob?._id}:`, dtoError)
        // Continue processing other jobs instead of failing entirely
      }
    }

    // Map MultiJob docs → DTOs
    for (const mongoMulti of DBmultiJobs) {
      try {
        if (!mongoMulti || !mongoMulti._id) {
          logger.warn('Skipping invalid MultiJob document without ID')
          continue
        }

        const userObj =
          typeof mongoMulti.user === 'object'
            ? (mongoMulti.user as IUser)
            : undefined

        const dto = buildMultiJobDTO({
          jobId: mongoMulti._id.toString(),
          mongo: mongoMulti,
          username: userObj?.username || 'anonymous'
        })

        allJobs.push(dto)
      } catch (dtoError) {
        logger.error(
          `Failed to build DTO for MultiJob ${mongoMulti?._id}:`,
          dtoError
        )
        // Continue processing other jobs instead of failing entirely
      }
    }

    if (!allJobs.length) {
      logger.info('No jobs found')
      res.status(204).json({ message: 'No jobs found' })
      return
    }

    res.status(200).json(allJobs)
  } catch (error) {
    logger.error(error)
    console.log(error)
    res.status(500).json({ message: 'Internal Server Error - getAllJobs' })
  }
}

const getJobById = async (req: Request, res: Response) => {
  const jobId = req.params.id
  if (!jobId) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }

  // Validate ObjectId format
  if (!/^[0-9a-fA-F]{24}$/.test(jobId)) {
    res.status(400).json({ message: 'Invalid Job ID format.' })
    return
  }

  try {
    const job = await Job.findOne({ _id: jobId }).populate('user').exec()
    const multiJob = job
      ? null
      : await MultiJob.findOne({ _id: jobId }).populate('user').exec()

    if (!job && !multiJob) {
      res.status(404).json({ message: `No job matches ID ${jobId}.` })
      return
    }

    if (job) {
      if (!job._id) {
        logger.error(`Job found but missing _id for jobId: ${jobId}`)
        res.status(500).json({ message: 'Job data integrity error.' })
        return
      }

      const userObj =
        typeof job.user === 'object' ? (job.user as IUser) : undefined

      const dto = buildBilboMDJobDTO({
        jobId,
        mongo: job,
        username: userObj?.username || 'anonymous'
      })

      res.status(200).json(dto)
    } else if (multiJob) {
      if (!multiJob._id) {
        logger.error(`MultiJob found but missing _id for jobId: ${jobId}`)
        res.status(500).json({ message: 'Job data integrity error.' })
        return
      }

      const userObj =
        typeof multiJob.user === 'object' ? (multiJob.user as IUser) : undefined

      const dto = buildMultiJobDTO({
        jobId,
        mongo: multiJob,
        username: userObj?.username || 'anonymous'
      })

      res.status(200).json(dto)
    }
  } catch (error) {
    logger.error(`Error retrieving job ${jobId}:`, error)
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`)
    }
    res.status(500).json({ message: 'Failed to retrieve job.' })
  }
}

export { getAllJobs, getJobById }
