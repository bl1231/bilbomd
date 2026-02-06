import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs-extra'
import { Job } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const downloadPublicJobResults = async (req: Request, res: Response) => {
  try {
    const { publicId } = req.params

    const job = await Job.findOne({
      public_id: publicId,
      access_mode: 'anonymous'
    })
      .lean()
      .exec()

    if (!job) {
      logger.warn(`downloadPublicJobResults: no job for publicId=${publicId}`)
      return res
        .status(404)
        .json({ message: `No anonymous job matches publicId ${publicId}.` })
    }

    if (!job.public_id) {
      logger.warn(
        `downloadPublicJobResults: job exists but public_id is missing for publicId=${publicId}`
      )
      return res
        .status(404)
        .json({ message: `Job found but public_id is invalid.` })
    }

    const { uuid, public_id } = job
    const outputFolder = path.join(uploadFolder, uuid)
    const uuidPrefix = uuid.split('-')[0]
    const pubidPrefix = public_id.split('-')[0]
    const resultsFilenameUUID = `results-${uuidPrefix}.tar.gz`
    const resultsFilenamePubID = `results-${pubidPrefix}.tar.gz`

    // Possible result file paths
    const possiblePaths = [
      path.join(outputFolder, resultsFilenameUUID),
      path.join(outputFolder, resultsFilenamePubID),
      path.join(outputFolder, `results.tar.gz`)
    ]

    // Check for the first existing file
    let resultFilePath: string | null = null
    for (const filePath of possiblePaths) {
      try {
        await fs.access(filePath)
        resultFilePath = filePath
        break
      } catch (error) {
        // Log the warning but continue checking other paths
        logger.warn(
          `downloadPublicJobResults: results not found at path=${filePath} for publicId=${publicId}: ${error}`
        )
      }
    }

    // If no file was found after checking all paths, return 404
    if (!resultFilePath) {
      return res
        .status(404)
        .json({ message: 'Results archive not found for this job.' })
    }

    // Set the download filename (using public ID-based name for public downloads)
    const resultsFilename = resultsFilenamePubID

    // Stream the file as a download
    return res.download(resultFilePath, resultsFilename)
  } catch (error) {
    logger.error('downloadPublicJobResults error:', error)
    return res.status(500).json({ message: 'Error downloading results.' })
  }
}

export { downloadPublicJobResults }
