// import path from 'path'
import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job, IJob } from '@bilbomd/mongodb-schema'
// import { BilboMDBullMQ } from '../../types/bilbomd.js'
// import { BilboMDSteps } from '../../types/bilbomd.js'
// import { getBullMQJob } from '../../queues/bilbomd.js'
// import { getBullMQScoperJob } from '../../queues/scoper.js'
// import {
//   calculateNumEnsembles,
//   calculateNumEnsembles2
// } from './utils/jobUtils.js'
// import { getScoperStatus } from './scoperStatus.js'

// const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

type PublicJobStatus = {
  publicId: string
  jobId: string
  uuid: string
  jobType: string
  status: string
  progress: number
  md_engine?: string
  submittedAt: Date
  startedAt?: Date
  completedAt?: Date
  classic?: { numEnsembles: number }
  auto?: { numEnsembles: number }
  alphafold?: { numEnsembles: number }
  scoper?: unknown
}

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

    // const jobDir = path.join(uploadFolder, job.uuid)
    // let bullmq: BilboMDBullMQ | undefined

    const response: PublicJobStatus = {
      publicId,
      jobId: job._id.toString(),
      uuid: job.uuid,
      jobType: job.__t,
      status: job.status,
      progress: job.progress ?? 0,
      md_engine: job.md_engine,
      submittedAt: job.time_submitted,
      startedAt: job.time_started,
      completedAt: job.time_completed
    }

    // if (
    //   job.__t === 'BilboMdPDB' ||
    //   job.__t === 'BilboMdCRD' ||
    //   job.__t === 'BilboMdSANS'
    // ) {
    //   bullmq = await getBullMQJob(job.uuid)
    //   if (bullmq && 'bilbomdStep' in bullmq) {
    //     const numEnsembles = await calculateNumEnsembles(
    //       bullmq.bilbomdStep as BilboMDSteps,
    //       jobDir
    //     )
    //     response.classic = { numEnsembles }
    //   }
    // } else if (job.__t === 'BilboMdAuto') {
    //   bullmq = await getBullMQJob(job.uuid)
    //   if (bullmq && 'bilbomdStep' in bullmq) {
    //     const numEnsembles = await calculateNumEnsembles(
    //       bullmq.bilbomdStep as BilboMDSteps,
    //       jobDir
    //     )
    //     response.auto = { numEnsembles }
    //   }
    // } else if (job.__t === 'BilboMdAlphaFold') {
    //   bullmq = await getBullMQJob(job.uuid)
    //   if (bullmq) {
    //     const numEnsembles = await calculateNumEnsembles2(jobDir)
    //     response.alphafold = { numEnsembles }
    //   }
    // } else if (job.__t === 'BilboMdScoper') {
    //   bullmq = await getBullMQScoperJob(job.uuid)
    //   if (bullmq) {
    //     response.scoper = await getScoperStatus(
    //       job as unknown as IBilboMDScoperJob
    //     )
    //   }
    // }

    res.status(200).json(response)
  } catch (error) {
    logger.error(`Error retrieving public job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve public job.' })
  }
}

export { getPublicJobById }
