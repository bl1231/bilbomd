import { logger } from '../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { Job } from '@bilbomd/mongodb-schema'
import { config } from '../config/config.js'
import { Request, Response } from 'express'

const getFile = async (req: Request, res: Response) => {
  const { id: rawId, filename: rawFilename } = req.params

  // Ensure parameters are strings
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const filename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename

  try {
    // Validate job ID and fetch the job
    const job = await Job.findOne({ _id: id }).exec()
    if (!job) {
      logger.warn('Job not found', { jobId: id })
      res.status(404).json({ error: 'Job not found.' })
      return
    }

    const sanitizedFilename = path.basename(filename)
    const fileDirectory = path.join(config.uploadDir, job.uuid)
    const filePath = path.join(fileDirectory, sanitizedFilename)

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      logger.warn('File not found in job', { filename: sanitizedFilename, jobId: id })
      res.status(404).json({ error: 'File not found' })
      return
    }

    // Log and serve the file
    logger.info('Serving file', { filename: sanitizedFilename, jobId: id })
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedFilename}"`
    )
    res.sendFile(filePath)
  } catch (error) {
    logger.error('Error retrieving file', { jobId: id, error: String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export { getFile }
