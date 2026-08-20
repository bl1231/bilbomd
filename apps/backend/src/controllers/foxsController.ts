import { logger } from '../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { Job, IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { getEnvVar } from '../config/config.js'
import {
  buildBilboFoxsData,
  buildScoperFoxsData
} from '../services/foxs/foxsDataService.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const downloadPDB = async (req: Request, res: Response) => {
  const rawJobId = req.params.id
  const rawPdbFilename = req.params.pdb

  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId
  const pdbFilename = Array.isArray(rawPdbFilename)
    ? rawPdbFilename[0]
    : rawPdbFilename

  if (!jobId) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }
  if (!pdbFilename) {
    res.status(400).json({ message: 'PDB filename required.' })
    return
  }
  logger.info('Looking up job', { jobId })
  const job = await Job.findOne({ _id: jobId }).exec()
  if (!job) {
    res.status(204).json({ message: `No job matches ID ${jobId}.` })
    return
  }
  const pdbFile = path.join(
    uploadFolder,
    job.uuid,
    'results',
    path.basename(pdbFilename)
  )

  try {
    await fs.promises.access(pdbFile)
    res.sendFile(pdbFile, (err) => {
      if (err) {
        res.status(500).json({
          message: 'Could not download the file . ' + err
        })
      } else {
        logger.info('File sent successfully', { pdbFilename, jobId })
      }
    })
  } catch (error) {
    logger.error('PDB file not available', { pdbFile, jobId, error: String(error) })
    res.status(500).json({ message: `No ${pdbFile} available.` })
  }
}

const getFoxsData = async (req: Request, res: Response) => {
  const rawJobId = req.params.id

  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId

  if (!jobId) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }

  const job = await Job.findOne({ _id: jobId }).exec()
  if (!job) {
    res.status(404).json({ message: `No job matches ID ${jobId}.` })
    return
  }

  try {
    if (job.__t === 'BilboMdScoper') {
      const scoperJob = job as unknown as IBilboMDScoperJob
      const data = await buildScoperFoxsData(scoperJob)
      res.json(data)
    } else {
      const data = await buildBilboFoxsData(job)
      res.json(data)
    }
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
      logger.error('Error getting FoXS data', { jobId, error: String(error) })
      res.status(500).json({ message: 'Error processing FoXS data.' })
    }
  }
}

export { getFoxsData, downloadPDB }
