import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs-extra'
import mongoose from 'mongoose'
import { logger } from '../middleware/loggers.js'
import multer from 'multer'
import {
  BilboMdSANSJob,
  IBilboMDSANSJob,
  User,
  IUser
} from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { sanitizeConstInpFile, writeJobParams } from './jobs/index.js'
import { queueJob } from '../queues/bilbomd.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const createNewSANSJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, UUID)
  logger.info(`createNewSANSJob ${UUID}`)
  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Created directory: ${jobDir}`)

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, jobDir)
      },
      filename: function (req, file, cb) {
        cb(null, file.originalname.toLowerCase())
      }
    })

    const upload = multer({ storage: storage })
    upload.fields([
      { name: 'pdb_file', maxCount: 1 },
      { name: 'dat_file', maxCount: 1 },
      { name: 'inp_file', maxCount: 1 },
      { name: 'rg', maxCount: 1 },
      { name: 'rg_min', maxCount: 1 },
      { name: 'rg_max', maxCount: 1 },
      { name: 'd2o_fraction', maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) {
        logger.error(`Failed to upload one or more files: ${err}`)
        res.status(500).json({ message: 'Failed to upload one or more files' })
        return
      }

      try {
        const { bilbomd_mode } = req.body
        const email = req.email

        const foundUser = await User.findOne({ email }).exec()

        if (!foundUser) {
          res.status(401).json({ message: 'No user found with that email' })
          return
        }

        if (!bilbomd_mode) {
          res.status(400).json({ message: 'No job type provided' })
          return
        }

        // Update jobCount and jobTypes
        const jobTypeField = `jobTypes.${bilbomd_mode}`
        await User.findByIdAndUpdate(foundUser._id, {
          $inc: { jobCount: 1, [jobTypeField]: 1 }
        })

        // Handle the job creation
        await handleBilboMDSANSJob(req, res, foundUser, UUID, jobDir)
      } catch (error) {
        logger.error(`Error occurred during job creation: ${error}`)
        res.status(500).json({ message: 'Internal server error' })
      }
    })
  } catch (error) {
    // Handle errors related to directory creation
    logger.error(`Failed to create job directory: ${error}`)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const handleBilboMDSANSJob = async (
  req: Request,
  res: Response,
  user: IUser,
  UUID: string,
  jobDir: string
) => {
  try {
    const { bilbomd_mode: bilbomdMode } = req.body
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    logger.info(`bilbomdMode: ${bilbomdMode}`)
    logger.info(`title: ${req.body.title}`)

    const pdbFile =
      files['pdb_file'] && files['pdb_file'][0]
        ? files['pdb_file'][0].originalname.toLowerCase()
        : ''
    const dataFile =
      files['dat_file'] && files['dat_file'][0]
        ? files['dat_file'][0].originalname.toLowerCase()
        : ''
    const constInpFile =
      files['inp_file'] && files['inp_file'][0]
        ? files['inp_file'][0].originalname.toLowerCase()
        : ''

    // Rename the original inp_file to create a backup
    const constInpFilePath = path.join(jobDir, constInpFile)
    const constInpOrigFilePath = path.join(jobDir, `${constInpFile}.orig`)

    await fs.copyFile(constInpFilePath, constInpOrigFilePath)

    // Sanitize the uploaded file (constInpFilePath)
    await sanitizeConstInpFile(constInpFilePath)

    // Capture deuteration fractions from request body
    const deuterationFractions: { [key: string]: number } = {}
    for (const key in req.body) {
      if (key.startsWith('deuteration_fraction_')) {
        const chainId = key.replace('deuteration_fraction_', '')
        deuterationFractions[chainId] = parseFloat(req.body[key])
      }
    }

    const now = new Date()
    // logger.info(`now ${now}`)
    const newJob: IBilboMDSANSJob = new BilboMdSANSJob({
      title: req.body.title,
      uuid: UUID,
      pdb_file: pdbFile,
      deuteration_fractions: deuterationFractions,
      d2o_fraction: req.body.d2o_fraction,
      data_file: dataFile,
      const_inp_file: constInpFile,
      conformational_sampling: 1,
      rg: req.body.rg,
      rg_min: req.body.rg_min,
      rg_max: req.body.rg_max,
      status: 'Submitted',
      time_submitted: now,
      user: user,
      steps: {
        pdb2crd: {},
        minimize: {},
        heat: {},
        md: {},
        dcd2pdb: {},
        pdb_remediate: {},
        pepsisans: {},
        gasans: {},
        results: {},
        email: {}
      }
    })
    // logger.info(`newJob ${newJob}`)
    // Save the job to the database
    try {
      await newJob.save()
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        logger.error(`Validation Error: ${error.message}`)
      } else if (error instanceof Error) {
        logger.error(`Error saving newJob: ${error}`)
      } else {
        logger.error(`Unknown error: ${error}`)
      }
      res.status(500).json({ message: 'Failed to save the job to the database' })
      return
    }

    logger.info(`${bilbomdMode} Job saved to  MongoDB: ${newJob.id}`)

    // Write Job params for use by NERSC job script.
    await writeJobParams(newJob.id)

    // Queue the job
    const BullId = await queueJob({
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob.id
    })

    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    res.status(200).json({
      message: `New ${bilbomdMode} Job ${newJob.title} successfully created`,
      jobid: newJob.id,
      uuid: newJob.uuid
    })
  } catch (error) {
    logger.error(`Failed to create BilboMD SANS Job: ${error}`)
    res.status(500).json({ message: 'Failed to create BilboMD SANS Job' })
  }
}

export { createNewSANSJob }
