import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import mongoose from 'mongoose'
import { Job, MultiJob, JobStatus } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const downloadJobResults = async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid job ID format' })
    return
  }

  try {
    // Find the job in either Job or MultiJob collection
    const job = await Job.findById(id).exec()
    const multiJob = await MultiJob.findById(id).exec()

    if (!job && !multiJob) {
      res.status(404).json({ message: `No job matches that ID` })
      return
    }

    const jobDoc = job || multiJob
    if (!jobDoc) {
      res.status(400).json({ message: 'Job document is null or undefined.' })
      return
    }

    if (jobDoc.status !== JobStatus.Completed) {
      res.status(400).json({
        message: `Job is not complete (status: ${jobDoc.status}). You may only download results for a job that has completed successfully.`
      })
      return
    }

    // Determine the result file path based on job type
    const { uuid } = job || multiJob!
    const outputFolder = path.join(uploadFolder, uuid)
    const uuidPrefix = uuid.split('-')[0]

    // Possible result file paths
    const possiblePaths = [
      path.join(outputFolder, `results-${uuidPrefix}.tar.gz`),
      path.join(outputFolder, `results.tar.gz`)
    ]

    let resultFilePath: string | null = null

    // Check for the first existing file
    for (const filePath of possiblePaths) {
      try {
        await fs.access(filePath)
        resultFilePath = filePath
        break
      } catch (error) {
        logger.warn(`Results file not found at ${filePath} ${error}`)
      }
    }

    if (!resultFilePath) {
      res.status(404).json({ message: 'Results file not found.' })
      return
    }

    // Set headers and initiate file download
    const filename = path.basename(resultFilePath)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.download(resultFilePath, filename, (err) => {
      if (err) {
        logger.error(`Error during file download: ${err}`)
        res.status(500).json({ message: `Could not download the file: ${err.message}` })
      }
    })
  } catch (error) {
    logger.error(`Error retrieving job: ${error}`)
    res.status(500).json({ message: 'An error occurred while processing your request.' })
  }
}

export { downloadJobResults }
