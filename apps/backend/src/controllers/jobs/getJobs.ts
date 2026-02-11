import { logger } from '../../middleware/loggers.js'
import {
  Job,
  IJob,
  User,
  IUser,
  MultiJob,
  IMultiJob
} from '@bilbomd/mongodb-schema'
import { Types } from 'mongoose'
import { Request, Response } from 'express'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import { buildBilboMDJobDTO, buildMultiJobDTO } from './utils/jobDTOMapper.js'

// Helper to resolve username from user field
type UserField =
  | IUser
  | Types.ObjectId
  | { _id?: unknown; $oid?: string }
  | { $oid: string }
  | string
  | null
  | undefined
const resolveUsername = async (userField: UserField): Promise<string> => {
  if (!userField) return 'anonymous'
  // If populated with username
  if (
    typeof userField === 'object' &&
    userField !== null &&
    'username' in userField &&
    (userField as IUser).username
  ) {
    return (userField as IUser).username!
  }
  // If only _id or ObjectId
  let userId: unknown = null
  if (
    typeof userField === 'object' &&
    userField !== null &&
    '_id' in userField
  ) {
    userId = (userField as { _id: unknown })._id
  } else if (
    typeof userField === 'object' &&
    userField !== null &&
    '$oid' in userField
  ) {
    userId = userField as { $oid: string }
  } else if (typeof userField === 'string') {
    userId = userField
  }
  if (userId) {
    try {
      const userDoc = await User.findById(userId).lean<IUser>()
      return userDoc?.username || 'anonymous'
    } catch (e) {
      logger.warn('Failed to fetch user for job', e)
    }
  }
  return 'anonymous'
}

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
      jobFilter = {
        $or: [{ user: user._id }, { 'user._id': user._id }]
      }
    }

    // Fetch jobs from both Job and MultiJob collections
    const [DBjobs, DBmultiJobs] = await Promise.all([
      Job.find(jobFilter).populate('user').lean<IJob[]>().exec(),
      MultiJob.find(jobFilter).populate('user').lean<IMultiJob[]>().exec()
    ])
    logger.info(
      `Fetched ${DBjobs.length} jobs and ${DBmultiJobs.length} multi-jobs`
    )

    // Combine both job types
    const allJobs: BilboMDJobDTO[] = []

    // Map Job collection docs → DTOs
    for (const mongoJob of DBjobs) {
      try {
        if (!mongoJob || !mongoJob._id) {
          logger.warn('Skipping invalid job document without ID')
          continue
        }

        const username = await resolveUsername(mongoJob.user)
        const dto = buildBilboMDJobDTO({
          jobId: mongoJob._id.toString(),
          mongo: mongoJob,
          username
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

        const username = await resolveUsername(mongoMulti.user)
        const dto = buildMultiJobDTO({
          jobId: mongoMulti._id.toString(),
          mongo: mongoMulti,
          username
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
    logger.error('Error in getAllJobs:', error)
    res.status(500).json({ message: 'Internal Server Error - getAllJobs' })
  }
}

const getJobById = async (req: Request, res: Response) => {
  const jobId = req.params.id
  if (!jobId) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }

  // Ensure jobId is a string and validate ObjectId format
  const jobIdString = Array.isArray(jobId) ? jobId[0] : jobId
  if (!/^[0-9a-fA-F]{24}$/.test(jobIdString)) {
    res.status(400).json({ message: 'Invalid Job ID format.' })
    return
  }

  try {
    const job = await Job.findOne({ _id: jobIdString }).populate('user').exec()
    const multiJob = job
      ? null
      : await MultiJob.findOne({ _id: jobIdString }).populate('user').exec()

    if (!job && !multiJob) {
      res.status(404).json({ message: `No job matches ID ${jobIdString}.` })
      return
    }

    if (job) {
      if (!job._id) {
        logger.error(`Job found but missing _id for jobId: ${jobIdString}`)
        res.status(500).json({ message: 'Job data integrity error.' })
        return
      }

      const username = await resolveUsername(job.user)
      const dto = buildBilboMDJobDTO({
        jobId: jobIdString,
        mongo: job,
        username
      })

      res.status(200).json(dto)
    } else if (multiJob) {
      if (!multiJob._id) {
        logger.error(`MultiJob found but missing _id for jobId: ${jobIdString}`)
        res.status(500).json({ message: 'Job data integrity error.' })
        return
      }

      const username = await resolveUsername(multiJob.user)
      const dto = buildMultiJobDTO({
        jobId: jobIdString,
        mongo: multiJob,
        username
      })

      res.status(200).json(dto)
    }
  } catch (error) {
    logger.error(`Error retrieving job ${jobIdString}:`, error)
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`)
    }
    res.status(500).json({ message: 'Failed to retrieve job.' })
  }
}

export { getAllJobs, getJobById }
