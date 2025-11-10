import { logger } from '../../middleware/loggers.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { User } from '@bilbomd/mongodb-schema'
import { BilboMDDispatchContext } from '../../types/bilbomd.js'
import { Request, Response } from 'express'
import { handleBilboMDClassicPDB } from './handleBilboMDClassicPDB.js'
import { handleBilboMDClassicCRD } from './handleBilboMDClassicCRD.js'
import { handleBilboMDAutoJob } from './handleBilboMDAutoJob.js'
import { handleBilboMDScoperJob } from './handleBilboMDScoperJob.js'
import { handleBilboMDAlphaFoldJob } from './handleBilboMDAlphaFoldJob.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const createNewJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, UUID)

  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Created directory: ${jobDir}`)

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, jobDir),
      filename: (req, file, cb) => cb(null, file.originalname.toLowerCase())
    })

    const upload = multer({ storage: storage })

    upload.fields([
      { name: 'bilbomd_mode', maxCount: 1 },
      { name: 'md_engine', maxCount: 1 },
      { name: 'psf_file', maxCount: 1 },
      { name: 'pdb_file', maxCount: 1 },
      { name: 'crd_file', maxCount: 1 },
      { name: 'inp_file', maxCount: 1 },
      { name: 'dat_file', maxCount: 1 },
      { name: 'pae_file', maxCount: 1 },
      { name: 'entities_json', maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) {
        logger.error(`Multer error during file upload: ${err}`)
        await fs.remove(jobDir)
        return res.status(400).json({
          message: 'File upload error',
          error: err.message || String(err)
        })
      }

      try {
        const { bilbomd_mode } = req.body

        if (!bilbomd_mode) {
          res.status(400).json({ message: 'No job type provided' })
          return
        }

        const email = req.email

        logger.info(
          `Job submission from: ${req.apiUser ? 'API token' : 'JWT session'}: ${email}`
        )

        const foundUser = await User.findOne({ email })
          .select('_id username email')
          .lean()
          .exec()

        if (!foundUser) {
          res.status(401).json({ message: 'No user found with that email' })
          return
        }

        // Update jobCount and jobTypes
        const jobTypeField = `jobTypes.${bilbomd_mode}`
        await User.findByIdAndUpdate(foundUser._id, {
          $inc: { jobCount: 1, [jobTypeField]: 1 }
        })

        // Convert _id to string for DispatchUser compatibility
        const dispatchUser = {
          ...foundUser,
          _id: foundUser._id.toString()
        }

        await dispatchBilboMDJob({
          req,
          res,
          bilbomd_mode,
          user: dispatchUser,
          UUID,
          accessMode: 'user'
        })
      } catch (error) {
        logger.error(`Job handler error: ${error}`)
        await fs.remove(jobDir)
        return res.status(500).json({
          message: 'Job submission failed',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred'

    logger.error(`handleBilboMDJob error: ${error}`)
    res.status(500).json({ message: msg })
  }
}

const createPublicJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const publicId = uuid()
  const jobDir = path.join(uploadFolder, UUID)

  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Created directory: ${jobDir}`)

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, jobDir),
      filename: (req, file, cb) => cb(null, file.originalname.toLowerCase())
    })

    const upload = multer({ storage: storage })

    upload.fields([
      { name: 'bilbomd_mode', maxCount: 1 },
      { name: 'md_engine', maxCount: 1 },
      { name: 'psf_file', maxCount: 1 },
      { name: 'pdb_file', maxCount: 1 },
      { name: 'crd_file', maxCount: 1 },
      { name: 'inp_file', maxCount: 1 },
      { name: 'dat_file', maxCount: 1 },
      { name: 'pae_file', maxCount: 1 },
      { name: 'entities_json', maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) {
        logger.error(`Multer error during file upload: ${err}`)
        await fs.remove(jobDir)
        return res.status(400).json({
          message: 'File upload error',
          error: err.message || String(err)
        })
      }

      try {
        const { bilbomd_mode } = req.body

        if (!bilbomd_mode) {
          res.status(400).json({ message: 'No job type provided' })
          return
        }

        logger.info(`Public job submission with ID: ${publicId}`)

        await dispatchBilboMDJob({
          req,
          res,
          bilbomd_mode,
          UUID,
          user: undefined,
          accessMode: 'anonymous',
          publicId
        })
      } catch (error) {
        logger.error(`Job handler error: ${error}`)
        await fs.remove(jobDir)
        return res.status(500).json({
          message: 'Anonymous job submission failed',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred'

    logger.error(`handleBilboMDJob error: ${error}`)
    res.status(500).json({ message: msg })
  }
}

const dispatchBilboMDJob = async (ctx: BilboMDDispatchContext) => {
  const { req, res, bilbomd_mode, user, UUID, accessMode, publicId } = ctx

  logger.info(`Starting BilboMDJob mode: ${bilbomd_mode} (${accessMode})`)

  if (bilbomd_mode === 'pdb') {
    await handleBilboMDClassicPDB(req, res, user, UUID, {
      accessMode,
      publicId
    })
  } else if (bilbomd_mode === 'crd_psf') {
    await handleBilboMDClassicCRD(req, res, user, UUID, {
      accessMode,
      publicId
    })
  } else if (bilbomd_mode === 'auto') {
    await handleBilboMDAutoJob(req, res, user, UUID, { accessMode, publicId })
  } else if (bilbomd_mode === 'scoper') {
    await handleBilboMDScoperJob(req, res, user, UUID, { accessMode, publicId })
  } else if (bilbomd_mode === 'alphafold') {
    await handleBilboMDAlphaFoldJob(req, res, user, UUID, {
      accessMode,
      publicId
    })
  } else {
    res.status(400).json({ message: 'Invalid job type' })
    return
  }
}

export { createNewJob, createPublicJob }
