import { Request, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../../middleware/loggers.js'
import { Job } from '@bilbomd/mongodb-schema'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const downloadPublicJobResultFile = async (req: Request, res: Response) => {
  const { publicId, filename } = req.params

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
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

    // Prevent path traversal
    const safeFileName = path.basename(filename)

    const filePath = path.join(uploadFolder, job.uuid, safeFileName)

    if (!fs.existsSync(filePath)) {
      logger.warn(
        `downloadPublicJobResultFile: file not found at ${filePath} for publicId=${publicId}`
      )
      return res
        .status(404)
        .json({ message: 'Requested result file not found for this job.' })
    }

    return res.sendFile(filePath)
  } catch (error) {
    logger.error(`Error retrieving public job result file: ${error}`)
    res
      .status(500)
      .json({ message: 'Failed to retrieve public job result file.' })
  }
}

export { downloadPublicJobResultFile }
