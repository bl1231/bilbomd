import mongoose from 'mongoose'
import fs from 'fs-extra'
import path from 'path'
import { Job } from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { getEnvVar } from '../../config/config.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const getLogForStep = async (req: Request, res: Response) => {
  if (!req?.params?.id) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }

  // Ensure id is a string and validate ObjectId format
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    res.status(400).json({ message: 'Invalid Job ID format.' })
    return
  }

  const job = await Job.findOne({ _id: jobId }).exec()
  if (!job) {
    res.status(204).json({ message: `No job matches ID ${jobId}.` })
    return
  }
  const step = req.query.step
  let logFile: string = ''
  switch (step) {
    case 'minimize':
      logFile = path.join(uploadFolder, job.uuid, 'minimize.out')
      break
    case 'heat':
      logFile = path.join(uploadFolder, job.uuid, 'heat.out')
      break
    default:
      res.status(200).json({
        logContent: `Cannot retrieve error logs for ${step} step.\n please contact SIBYLS staff\n`
      })
  }

  fs.readFile(logFile, 'utf8', (err, data) => {
    if (err) {
      // Handle any errors that occurred while reading the file
      res.status(500).json({ message: 'Error reading log file' })
    }

    // Send the log file content in a JSON response
    res.status(200).json({ logContent: data })
  })
}

export { getLogForStep }
