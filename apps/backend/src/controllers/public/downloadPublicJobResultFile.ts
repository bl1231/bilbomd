import { Request, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../../middleware/loggers.js'
import { Job } from '@bilbomd/mongodb-schema'
import { getEnvVar } from '../../config/config.js'
import { publicJobQuery } from './utils/publicJobQuery.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

// The files the public job page loads by name: the Mol* ensemble and starting
// models, the PAE tab images and the BioEmu2 alignment report. Nothing else
// in the job dir (inputs, params.json, logs, intermediate files) is served
// here; the full results come from the /results tarball.
const PUBLIC_RESULT_FILES: RegExp[] = [
  /^ensemble_size_\d+_model\.pdb$/,
  /^minimization_output\.pdb$/,
  /^scoper_combined_[A-Za-z0-9._-]+\.pdb$/,
  /^pae\.png$/,
  /^viz\.png$/,
  /^alignment\.json$/
]

const isPublicResultFile = (filename: string): boolean =>
  PUBLIC_RESULT_FILES.some((pattern) => pattern.test(filename))

const downloadPublicJobResultFile = async (req: Request, res: Response) => {
  const { publicId: rawPublicId, filename: rawFilename } = req.params

  // Ensure parameters are strings
  const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId
  const filename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  // Answered like a missing file, so the response doesn't say which names
  // exist in the job dir
  if (!filename || !isPublicResultFile(filename)) {
    logger.warn(
      `downloadPublicJobResultFile: file not served for publicId=${publicId}, filename=${filename}`
    )
    res
      .status(404)
      .json({ message: 'Requested result file not found for this job.' })
    return
  }

  try {
    const job = await Job.findOne(publicJobQuery(publicId)).exec()

    if (!job) {
      res.status(404).json({ message: `No job matches publicId ${publicId}.` })
      return
    }

    // The allowlist already rules out path separators; basename stays as a
    // second guard against path traversal
    const safeFileName = path.basename(filename)
    const jobDir = path.join(uploadFolder, job.uuid)

    const possibleDirs = [
      jobDir,
      path.join(jobDir, 'results'),
      path.join(jobDir, 'analysis')
    ]
    let filePath = null
    for (const dir of possibleDirs) {
      const candidate = path.join(dir, safeFileName)
      if (fs.existsSync(candidate)) {
        filePath = candidate
        break
      }
    }

    if (!filePath) {
      logger.warn(
        `downloadPublicJobResultFile: file not found in any directory for publicId=${publicId}, filename=${filename}`
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

export { downloadPublicJobResultFile, isPublicResultFile }
