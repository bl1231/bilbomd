import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs-extra'
import { Job } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'
import { getEnvVar } from '../../config/config.js'
import { publicJobQuery } from './utils/publicJobQuery.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const downloadPublicJobResults = async (req: Request, res: Response) => {
  try {
    const { publicId: rawPublicId } = req.params
    const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId

    const job = await Job.findOne(publicJobQuery(publicId)).lean().exec()

    if (!job) {
      logger.warn(`downloadPublicJobResults: no job for publicId=${publicId}`)
      return res
        .status(404)
        .json({ message: `No job matches publicId ${publicId}.` })
    }

    const { uuid } = job
    const outputFolder = path.join(uploadFolder, uuid)
    const uuidPrefix = uuid.split('-')[0]
    // publicId matched either public_id or results_token, so it names this job
    const pubidPrefix = publicId.split('-')[0]
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
