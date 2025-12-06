import { v4 as uuid } from 'uuid'
import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../middleware/loggers.js'
import multer from 'multer'
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
import { Request, Response } from 'express'
import { BilboMDDispatchContext } from '../../types/bilbomd.js'
import { hashClientIp } from '../public/utils/hashClientIp.js'
import { handleBilboMDSANSJob } from './handleBilboMDSANSJob.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const createSANSJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, UUID)
  logger.info(`createSANSJob ${UUID}`)
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
        await fs.remove(jobDir)
        res.status(500).json({ message: 'Failed to upload one or more files' })
        return
      }

      try {
        const { bilbomd_mode } = req.body
        const email = req.email

        const foundUser = await User.findOne({ email })
          .select('_id username email')
          .lean()
          .exec()

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

        // Convert _id to string for DispatchUser compatibility
        const dispatchUser = {
          ...foundUser,
          _id: foundUser._id.toString()
        }

        // Handle the job creation
        await dispatchBilboMDSANSJob({
          req,
          res,
          bilbomd_mode,
          UUID,
          user: dispatchUser,
          accessMode: 'user'
        })
      } catch (error) {
        logger.error(`Error occurred during job creation: ${error}`)
        await fs.remove(jobDir)
        res.status(500).json({ message: 'Internal server error' })
      }
    })
  } catch (error) {
    // Handle errors related to directory creation
    logger.error(`Failed to create job directory: ${error}`)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const createPublicSANSJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const publicId = uuid()
  const jobDir = path.join(uploadFolder, UUID)
  logger.info(`createPublicSANSJob ${UUID}`)
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
        await fs.remove(jobDir)
        res.status(500).json({ message: 'Failed to upload one or more files' })
        return
      }

      try {
        const { bilbomd_mode } = req.body

        const foundUser = undefined

        if (!bilbomd_mode) {
          res.status(400).json({ message: 'No job type provided' })
          return
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

        // Handle the job creation
        await dispatchBilboMDSANSJob({
          req,
          res,
          bilbomd_mode,
          UUID,
          user: foundUser,
          accessMode: 'anonymous',
          publicId,
          client_ip_hash
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
    // Handle errors related to directory creation
    logger.error(`Failed to create job directory: ${error}`)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const dispatchBilboMDSANSJob = async (ctx: BilboMDDispatchContext) => {
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
  await handleBilboMDSANSJob(req, res, user, UUID, {
    accessMode,
    publicId,
    client_ip_hash
  })
}

export { createSANSJob, createPublicSANSJob }
