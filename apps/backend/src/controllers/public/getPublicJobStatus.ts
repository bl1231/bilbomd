import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job, IJob } from '@bilbomd/mongodb-schema'
import type { PublicJobStatus, JobResultsDTO } from '@bilbomd/bilbomd-types'
import { mapDiscriminatorToJobType } from '../jobs/utils/jobDTOMapper.js'

const getPublicJobById = async (req: Request, res: Response) => {
  const { publicId } = req.params

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
    // Only allow access to anonymous jobs via publicId
    const job = await Job.findOne({
      public_id: publicId,
      access_mode: 'anonymous'
    })
      .lean<IJob>()
      .exec()

    if (!job) {
      res
        .status(404)
        .json({ message: `No anonymous job matches publicId ${publicId}.` })
      return
    }

    const jobType = mapDiscriminatorToJobType(job.__t)

    const response: PublicJobStatus = {
      publicId,
      jobId: job._id.toString(),
      uuid: job.uuid,
      jobType: jobType,
      status: job.status,
      progress: job.progress ?? 0,
      md_engine: job.md_engine,
      submittedAt: job.time_submitted,
      startedAt: job.time_started,
      completedAt: job.time_completed,
      results: job.results as JobResultsDTO
    }

    res.status(200).json(response)
  } catch (error) {
    logger.error(`Error retrieving public job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve public job.' })
  }
}

export { getPublicJobById }
