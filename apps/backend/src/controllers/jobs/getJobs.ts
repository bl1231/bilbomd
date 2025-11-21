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
      const userObj =
        typeof mongoJob.user === 'object' ? (mongoJob.user as IUser) : undefined

      const dto = buildBilboMDJobDTO({
        jobId: mongoJob._id.toString(),
        mongo: mongoJob,
        username: userObj?.username || 'anonymous'
      })

      allJobs.push(dto)
    }

    // Map MultiJob docs → DTOs
    for (const mongoMulti of DBmultiJobs) {
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
      const userObj =
        typeof job.user === 'object' ? (job.user as IUser) : undefined

      const dto = buildBilboMDJobDTO({
        jobId,
        mongo: job,
        username: userObj?.username || 'anonymous'
      })

      res.status(200).json(dto)
    } else if (multiJob) {
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
    logger.error(`Error retrieving job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve job.' })
  }
}

export { getAllJobs, getJobById }
