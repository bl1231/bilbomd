import { logger } from '../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { Job } from '@bl1231/bilbomd-mongodb-schema'
import { config } from '../config/config.js'
import { Request, Response } from 'express'

const getFile = async (req: Request, res: Response) => {
  const { id, filename } = req.params

  try {
    // Validate job ID and fetch the job
    const job = await Job.findOne({ _id: id }).exec()
    if (!job) {
      logger.warn(`Job with ID ${id} not found.`)
      res.status(404).json({ error: 'Job not found.' })
      return
    }

    const sanitizedFilename = path.basename(filename)
    const fileDirectory = path.join(config.uploadDir, job.uuid)
    const filePath = path.join(fileDirectory, sanitizedFilename)

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      logger.warn(`File ${sanitizedFilename} not found in job ${id}.`)
      res.status(404).json({ error: 'File not found' })
      return
    }

    // Log and serve the file
    logger.info(`Serving file ${sanitizedFilename} for job ${id}`)
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`)
    res.sendFile(filePath)
  } catch (error) {
    logger.error(`Error retrieving file for job ${id}: ${error}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export { getFile }
