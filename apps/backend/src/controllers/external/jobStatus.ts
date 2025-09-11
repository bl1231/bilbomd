import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { Job } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../middleware/loggers.js'

export const getApiJobStatus = async (req: Request, res: Response) => {
  try {
    const user = req.apiUser
    const { id } = req.params

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

    // Check that the job belongs to the requesting API user
    if (job.user.toString() !== user._id.toString()) {
      res.status(403).json({ message: 'Forbidden: job does not belong to user' })
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
