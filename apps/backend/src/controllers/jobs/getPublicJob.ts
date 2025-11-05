import path from 'path'
import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job, IJob, IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { BilboMDJob, BilboMDBullMQ } from '../../types/bilbomd.js'
import { BilboMDSteps } from '../../types/bilbomd.js'
import { getBullMQJob } from '../../queues/bilbomd.js'
import { getBullMQScoperJob } from '../../queues/scoper.js'
import {
  calculateNumEnsembles,
  calculateNumEnsembles2
} from './utils/jobUtils.js'
import { getScoperStatus } from './scoperStatus.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const getPublicJobById = async (req: Request, res: Response) => {
  const { publicId } = req.params

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
    // Only allow access to anonymous jobs via publicId
    const job = await Job.findOne({
      publicId,
      accessMode: 'anonymous'
    })
      .lean<IJob>()
      .exec()

    if (!job) {
      res
        .status(404)
        .json({ message: `No anonymous job matches publicId ${publicId}.` })
      return
    }

    const jobDir = path.join(uploadFolder, job.uuid)
    const bilbomdJob: BilboMDJob = {
      id: job._id.toString(),
      mongo: job
    }

    let bullmq: BilboMDBullMQ | undefined

    if (
      job.__t === 'BilboMdPDB' ||
      job.__t === 'BilboMdCRD' ||
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
        bilbomdJob.scoper = await getScoperStatus(
          job as unknown as IBilboMDScoperJob
        )
      }
    }

    // For anonymous jobs, job.user should be undefined anyway,
    // but this makes it explicit we’re not leaking any user data.
    if ('user' in bilbomdJob.mongo) {
      delete (bilbomdJob.mongo as IJob).user
    }

    res.status(200).json(bilbomdJob)
  } catch (error) {
    logger.error(`Error retrieving public job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve public job.' })
  }
}

export { getPublicJobById }
