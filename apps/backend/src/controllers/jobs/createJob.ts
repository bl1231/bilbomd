import { logger } from '../../middleware/loggers.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { BilboMDDispatchContext } from '../../types/bilbomd.js'
import { Request, Response } from 'express'
import { handleBilboMDClassicPDB } from './handleBilboMDClassicPDB.js'
import { handleBilboMDClassicCRD } from './handleBilboMDClassicCRD.js'
import { handleBilboMDAutoJob } from './handleBilboMDAutoJob.js'
import { handleBilboMDScoperJob } from './handleBilboMDScoperJob.js'
import { handleBilboMDAlphaFoldJob } from './handleBilboMDAlphaFoldJob.js'
import applyExampleDataIfRequested from './utils/exampleData.js'
import { hashClientIp } from '../public/utils/hashClientIp.js'
import {
  User,
  BilboMdPDBJob,
  BilboMdCRDJob,
  BilboMdAutoJob,
  BilboMdAlphaFoldJob,
  BilboMdSANSJob,
  BilboMdScoperJob,
  MultiJob,
  JobStatus
} from '@bilbomd/mongodb-schema'

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

        // Handle example data if requested
        const exampleResult = await applyExampleDataIfRequested(req, jobDir)
        if (exampleResult.usingExampleData) {
          req.body.dat_file = exampleResult.data_file
          if (exampleResult.pdb_file) req.body.pdb_file = exampleResult.pdb_file
          if (exampleResult.crd_file) req.body.crd_file = exampleResult.crd_file
          if (exampleResult.inp_file) req.body.inp_file = exampleResult.inp_file
          if (exampleResult.pae_file) req.body.pae_file = exampleResult.pae_file
          if (exampleResult.psf_file) req.body.psf_file = exampleResult.psf_file
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

        // Handle example data if requested
        const exampleResult = await applyExampleDataIfRequested(req, jobDir)
        if (exampleResult.usingExampleData) {
          req.body.dat_file = exampleResult.data_file
          if (exampleResult.pdb_file) req.body.pdb_file = exampleResult.pdb_file
          if (exampleResult.crd_file) req.body.crd_file = exampleResult.crd_file
          if (exampleResult.inp_file) req.body.inp_file = exampleResult.inp_file
          if (exampleResult.pae_file) req.body.pae_file = exampleResult.pae_file
          if (exampleResult.psf_file) req.body.psf_file = exampleResult.psf_file
        }

        logger.info(`Public job submission with ID: ${publicId}`)

        // Compute client IP hash for quota check and job storage
        const clientIp =
          (req.headers['cf-connecting-ip'] as string) || req.ip || 'unknown'
        const client_ip_hash = hashClientIp(clientIp)

        // Quota check: Count active jobs for this client IP hash
        const activeStatuses = [
          JobStatus.Submitted,
          JobStatus.Pending,
          JobStatus.Running
        ]
        const quotaQuery = {
          client_ip_hash,
          status: { $in: activeStatuses },
          access_mode: 'anonymous'
        }
        const activeJobsCount = await Promise.all([
          BilboMdPDBJob.countDocuments(quotaQuery),
          BilboMdCRDJob.countDocuments(quotaQuery),
          BilboMdAutoJob.countDocuments(quotaQuery),
          BilboMdSANSJob.countDocuments(quotaQuery),
          BilboMdAlphaFoldJob.countDocuments(quotaQuery),
          BilboMdScoperJob.countDocuments(quotaQuery),
          MultiJob.countDocuments(quotaQuery)
        ]).then((counts) => counts.reduce((sum, count) => sum + count, 0))

        logger.info(
          `Active jobs for client IP hash ${client_ip_hash}: ${activeJobsCount}`
        )

        if (activeJobsCount >= 3) {
          await fs.remove(jobDir) // Clean up created directory
          logger.warn(`Quota exceeded for IP hash ${client_ip_hash}`)
          return res.status(429).json({
            message:
              'Quota exceeded: You can have at most 3 active jobs at a time. Please wait for some jobs to complete.'
          })
        }

        await dispatchBilboMDJob({
          req,
          res,
          bilbomd_mode,
          UUID,
          user: undefined,
          accessMode: 'anonymous',
          publicId,
          client_ip_hash // Pass to handlers
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
  const {
    req,
    res,
    bilbomd_mode,
    user,
    UUID,
    accessMode,
    publicId,
    client_ip_hash
  } = ctx

  logger.info(`Starting BilboMDJob mode: ${bilbomd_mode} (${accessMode})`)

  if (bilbomd_mode === 'pdb') {
    await handleBilboMDClassicPDB(req, res, user, UUID, {
      accessMode,
      publicId,
      client_ip_hash // Pass it
    })
  } else if (bilbomd_mode === 'crd_psf') {
    await handleBilboMDClassicCRD(req, res, user, UUID, {
      accessMode,
      publicId,
      client_ip_hash
    })
  } else if (bilbomd_mode === 'auto') {
    await handleBilboMDAutoJob(req, res, user, UUID, {
      accessMode,
      publicId,
      client_ip_hash
    })
  } else if (bilbomd_mode === 'scoper') {
    await handleBilboMDScoperJob(req, res, user, UUID, {
      accessMode,
      publicId,
      client_ip_hash
    })
  } else if (bilbomd_mode === 'alphafold') {
    await handleBilboMDAlphaFoldJob(req, res, user, UUID, {
      accessMode,
      publicId,
      client_ip_hash
    })
  } else {
    res.status(400).json({ message: 'Invalid job type' })
    return
  }
}

export { createNewJob, createPublicJob }
