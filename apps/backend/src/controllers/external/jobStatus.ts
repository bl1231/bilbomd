import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { Job } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

export const getApiJobStatus = async (req: Request, res: Response) => {
  try {
    const user = req.apiUser
    const rawId = req.params.id

    // Ensure id is a string
    const id = Array.isArray(rawId) ? rawId[0] : rawId

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid job ID format' })
      return
    }

    if (!user) {
      res.status(403).json({ message: 'Unauthorized access' })
      return
    }

    const job = await Job.findById(id)
    if (!job) {
      res.status(404).json({ message: 'No job found with ID' })
      return
    }

    if (!job.user) {
      res
        .status(403)
        .json({ message: 'Forbidden: job does not belong to user' })
      return
    }

    // Check that the job belongs to the requesting API user
    // Handle both populated user object and ObjectId reference (backwards compatibility)
    const jobUserId =
      typeof job.user === 'object' && job.user !== null && '_id' in job.user
        ? job.user._id.toString()
        : (job.user as mongoose.Types.ObjectId).toString()

    if (jobUserId !== user._id.toString()) {
      res
        .status(403)
        .json({ message: 'Forbidden: job does not belong to user' })
      return
    }

    res.status(200).json({
      status: job.status,
      progress: job.progress ?? null,
      title: job.title,
      mode: job.__t,
      uuid: job.uuid,
      submittedAt: job.time_submitted,
      completedAt: job.time_completed ?? null
    })
  } catch (err) {
    logger.error('getApiJobStatus error:', err)
    res.status(500).json({ message: 'Failed to retrieve job status' })
  }
}
