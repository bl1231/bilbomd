import { logger } from '../middleware/loggers.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import { pdb2crdQueue, queueJob } from '../queues/pdb2crd.js'

const uploadFolder: string = process.env.DATA_VOL ?? '/bilbomd/uploads'

const createNewConstFile = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, UUID)

  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Created Directory: ${jobDir}`)

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, jobDir)
      },
      filename: function (req, file, cb) {
        if (file.fieldname === 'pae_file') {
          cb(null, 'pae.json') // Force standard filename needed by worker
        } else {
          cb(null, file.originalname.toLowerCase())
        }
      }
    })

    const upload = multer({ storage: storage })

    upload.fields([
      { name: 'pdb_file', maxCount: 1 },
      { name: 'pae_file', maxCount: 1 },
      { name: 'pae_power', maxCount: 1 },
      { name: 'plddt_cutoff', maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) {
        logger.error(err)
        res.status(500).json({ message: 'Failed to upload one or more files' })
      }
      try {
        const { pae_power, plddt_cutoff } = req.body
        const email = req.email
        const user = await User.findOne({ email }).exec()
        if (!user) {
          res.status(401).json({ message: 'No user found with that email' })
          return
        }
        const files = req.files as { [fieldname: string]: Express.Multer.File[] }
        const pdbFileName =
          files['pdb_file'] && files['pdb_file'][0]
            ? files['pdb_file'][0].originalname.toLowerCase()
            : 'missing.pdb'

        const BullId = await queueJob({
          type: 'Pdb2Crd',
          title: 'convert PDB to CRD',
          uuid: UUID,
          pdb_file: pdbFileName,
          pae_power: pae_power,
          plddt_cutoff: plddt_cutoff
        })
        logger.info(`Pdb2Crd Job assigned UUID: ${UUID}`)
        logger.info(`Pdb2Crd Job assigned BullMQ ID: ${BullId}`)

        res.status(202).json({
          message: 'PAE job accepted and queued',
          uuid: UUID
        })
      } catch (error) {
        logger.error(`Error queueing PDB2CRD conversion: ${error}`)
        res.status(500).json({ message: 'Error queueing PDB2CRD conversion' })
      }
    })
  } catch (error) {
    logger.error(`Failed to create job directory: ${error}`)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const getAf2PaeStatus = async (req: Request, res: Response) => {
  const { uuid } = req.query
  if (typeof uuid !== 'string') return res.status(400).json({ message: 'Missing uuid' })

  try {
    const bullJob = await pdb2crdQueue.getJob(uuid)
    if (!bullJob) {
      logger.warn(`Job with UUID ${uuid} not found`)
      return res.status(404).json({ message: 'Job not found' })
    }

    const bullStatus = await bullJob.getState()
    return res.status(200).json({
      uuid,
      status: bullStatus
    })
  } catch (error) {
    logger.error(`Error checking AF2PAE job status: ${error}`)
    return res.status(500).json({ message: 'Error checking job status' })
  }
}

const downloadConstFile = async (req: Request, res: Response) => {
  const { uuid } = req.query
  // Check if uuid is provided
  if (!uuid || typeof uuid !== 'string') {
    res.status(400).json({ message: 'Job UUID required.' })
    return // Stop execution if uuid is missing or invalid
  }
  logger.info(`Request to download ${uuid}`)
  if (!uuid) {
    res.status(400).json({ message: 'Job UUID required.' })
  }
  const constFile = path.join(uploadFolder, uuid.toString(), 'const.inp')
  try {
    await fs.promises.access(constFile)
    res.download(constFile, (err) => {
      if (err) {
        res.status(500).json({
          message: 'Could not download the file . ' + err
        })
      }
    })
  } catch (error) {
    logger.error(`No ${constFile} available. ${error}`)
    res.status(500).json({ message: `No ${constFile} available.` })
  }
}

export { createNewConstFile, getAf2PaeStatus, downloadConstFile }
