import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job } from '@bilbomd/mongodb-schema'
import { buildBilboFoxsData } from '../../services/foxs/foxsDataService.js'

const getPublicFoxsData = async (req: Request, res: Response) => {
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
    }).exec()

    if (!job) {
      res
        .status(404)
        .json({ message: `No anonymous job matches publicId ${publicId}.` })
      return
    }

    const data = await buildBilboFoxsData(job)
    res.json(data)
  } catch (error) {
    const err = error as Error & { status?: number; code?: string; details?: unknown }
    const status = err.status ?? 500

    if (status === 404) {
      res.status(404).json({
        code: err.code ?? 'NOT_FOUND',
        message: err.message,
        details: err.details
      })
    } else {
      logger.error(`Error getting FoXS data: ${error}`)
      res.status(500).json({ message: 'Error processing FoXS data.' })
    }
  }
}
export default getPublicFoxsData
