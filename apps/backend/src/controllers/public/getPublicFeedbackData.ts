import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job } from '@bilbomd/mongodb-schema'
import { publicJobQuery } from './utils/publicJobQuery.js'

const getPublicFeedbackData = async (req: Request, res: Response) => {
  const { publicId: rawPublicId } = req.params
  const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
    const job = await Job.findOne(publicJobQuery(publicId)).exec()

    if (!job) {
      res
        .status(404)
        .json({ message: `No job matches publicId ${publicId}.` })
      return
    }

    if (!job.feedback) {
      res
        .status(404)
        .json({ message: `No feedback data found for publicId ${publicId}.` })
      return
    }

    res.status(200).json(job.feedback)
  } catch (error) {
    logger.error(`Error retrieving public feedback data: ${error}`)
    res
      .status(500)
      .json({ message: 'Failed to retrieve public feedback data.' })
  }
}

export { getPublicFeedbackData }
