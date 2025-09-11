import { logger } from '../../middleware/loggers.js'
import path from 'path'
import { getBullMQJob } from '../../queues/bilbomd.js'
import { getBullMQScoperJob } from '../../queues/scoper.js'
import {
  Job,
  IJob,
  User,
  IBilboMDScoperJob,
  MultiJob,
  IMultiJob,
  IUser
} from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { BilboMDSteps } from '../../types/bilbomd.js'
import { BilboMDJob, BilboMDBullMQ } from '../../types/bilbomd.js'
import { calculateNumEnsembles, calculateNumEnsembles2 } from './utils/jobUtils.js'
import { getScoperStatus } from './scoperStatus.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const getAllJobs = async (req: Request, res: Response) => {
  try {
    const username = req.user as string
    const roles = req.roles as string[]

    // Determine if the user is an admin or manager based on their roles
    const isAdmin = roles.includes('Admin')
    const isManager = roles.includes('Manager')

    let jobFilter = {}
    if (!isAdmin && !isManager) {
      logger.info(`User ${username} is not an Admin or Manager - filtering by username`)
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
    const allJobs = [...DBjobs, ...DBmultiJobs]

    if (!allJobs?.length) {
      logger.info('No jobs found')
      res.status(204).json({ message: 'No jobs found' })
      return
    }

    // Process and format jobs
    const formattedJobs = await Promise.all(
      allJobs.map(async (mongo) => {
        let bullmq = null
        if (['BilboMd', 'BilboMdAuto'].includes(mongo.__t)) {
          bullmq = await getBullMQJob(mongo.uuid)
        } else if (mongo.__t === 'BilboMdScoper') {
          bullmq = await getBullMQScoperJob(mongo.uuid)
        }

        let username = 'unknown'
        if (mongo.user && typeof mongo.user === 'object' && 'username' in mongo.user) {
          const user = mongo.user as IUser
          user.id = user._id.toString()
          username = user.username
        }

        return {
          mongo,
          bullmq,
          username
        }
      })
    )

    res.status(200).json(formattedJobs)
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
    // Search in both collections
    const job = await Job.findOne({ _id: jobId }).exec()
    const multiJob = job ? null : await MultiJob.findOne({ _id: jobId }).exec()

    // Handle case where job is not found in either collection
    if (!job && !multiJob) {
      res.status(404).json({ message: `No job matches ID ${jobId}.` })
      return
    }

    // Determine job type
    if (job) {
      // Process Job collection entries
      const jobDir = path.join(uploadFolder, job.uuid)
      let bullmq: BilboMDBullMQ | undefined

      const bilbomdJob: BilboMDJob = { id: jobId, mongo: job }

      if (
        job.__t === 'BilboMdPDB' ||
        job.__t === 'BilboMdCRD' ||
        job.__t === 'BilboMd' ||
        job.__t === 'BilboMdSANS'
      ) {
        bullmq = await getBullMQJob(job.uuid)
        if (bullmq && 'bilbomdStep' in bullmq) {
          bilbomdJob.bullmq = bullmq
          bilbomdJob.classic = await calculateNumEnsembles(
            bullmq.bilbomdStep as BilboMDSteps,
            jobDir
          )
        }
      } else if (job.__t === 'BilboMdAuto') {
        bullmq = await getBullMQJob(job.uuid)
        if (bullmq && 'bilbomdStep' in bullmq) {
          bilbomdJob.bullmq = bullmq
          bilbomdJob.auto = await calculateNumEnsembles(
            bullmq.bilbomdStep as BilboMDSteps,
            jobDir
          )
        }
      } else if (job.__t === 'BilboMdAlphaFold') {
        bullmq = await getBullMQJob(job.uuid)
        if (bullmq) {
          bilbomdJob.bullmq = bullmq
          bilbomdJob.alphafold = await calculateNumEnsembles2(jobDir)
        }
      } else if (job.__t === 'BilboMdScoper') {
        bullmq = await getBullMQScoperJob(job.uuid)
        if (bullmq) {
          bilbomdJob.bullmq = bullmq
          bilbomdJob.scoper = await getScoperStatus(job as unknown as IBilboMDScoperJob)
        }
      }

      res.status(200).json(bilbomdJob)
    } else if (multiJob) {
      // Process MultiJob collection entries
      const multiJobDir = path.join(uploadFolder, multiJob.uuid)

      // Construct a response for MultiJob
      const multiJobResponse = {
        id: jobId,
        mongo: multiJob,
        jobDir: multiJobDir,
        status: multiJob.status,
        progress: multiJob.progress
      }

      res.status(200).json(multiJobResponse)
    }
  } catch (error) {
    logger.error(`Error retrieving job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve job.' })
  }
}

export { getAllJobs, getJobById }
