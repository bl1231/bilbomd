import { logger } from '../../middleware/loggers.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { User } from '@bl1231/bilbomd-mongodb-schema'
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
        return res
          .status(400)
          .json({ message: 'File upload error', error: err.message || String(err) })
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

        const foundUser = await User.findOne({ email }).exec()

        if (!foundUser) {
          res.status(401).json({ message: 'No user found with that email' })
          return
        }

        // Update jobCount and jobTypes
        const jobTypeField = `jobTypes.${bilbomd_mode}`
        await User.findByIdAndUpdate(foundUser._id, {
          $inc: { jobCount: 1, [jobTypeField]: 1 }
        })

        // Route to the appropriate handler
        logger.info(`Starting BilboMDJob mode: ${bilbomd_mode}`)
        if (bilbomd_mode === 'pdb') {
          logger.info('Starting BilboMDJobClassicPDB')
          await handleBilboMDClassicPDB(req, res, foundUser, UUID)
        } else if (bilbomd_mode === 'crd_psf') {
          logger.info('Starting BilboMDJobClassicCRD')
          await handleBilboMDClassicCRD(req, res, foundUser, UUID)
        } else if (bilbomd_mode === 'auto') {
          logger.info('Starting BilboMDAutoJob')
          await handleBilboMDAutoJob(req, res, foundUser, UUID)
        } else if (bilbomd_mode === 'scoper') {
          logger.info('Starting BilboMDScoperJob')
          await handleBilboMDScoperJob(req, res, foundUser, UUID)
        } else if (bilbomd_mode === 'alphafold') {
          logger.info('Starting BilboMDAlphaFoldJob')
          await handleBilboMDAlphaFoldJob(req, res, foundUser, UUID)
        } else {
          res.status(400).json({ message: 'Invalid job type' })
          return
        }
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

export { createNewJob }
