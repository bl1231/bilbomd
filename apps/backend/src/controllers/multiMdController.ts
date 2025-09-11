import { logger } from '../middleware/loggers.js'
import { config } from '../config/config.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid, validate as uuidValidate, version as uuidVersion } from 'uuid'
import { User, IUser, MultiJob } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { queueJob } from '../queues/multimd.js'

const createNewMultiJob = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(config.uploadDir, UUID)
  // let user: IUser

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

    upload.fields([{ name: 'bilbomd_uuids', maxCount: 1 }])(req, res, async (err) => {
      if (err) {
        logger.error(err)
        res.status(500).json({ message: 'Failed to upload one or more files' })
        return
      }
      try {
        const email = req.email
        logger.info(`Processing MultiJob creation for e-mail: ${email}`)

        const foundUser = await User.findOne({ email }).exec()
        if (!foundUser) {
          res.status(401).json({ message: 'No user found with that email' })
          return
        }

        // Update jobCount and jobTypes
        const bilbomd_mode = 'multimd'
        const jobTypeField = `jobTypes.${bilbomd_mode}`
        await User.findByIdAndUpdate(foundUser._id, {
          $inc: { jobCount: 1, [jobTypeField]: 1 }
        })

        await handleBilboMDMultiJobCreation(req, res, foundUser, UUID)
      } catch (error) {
        logger.error(error)
        res.status(500).json({ message: 'Internal server error' })
      }
    })
  } catch (error) {
    // Handle errors related to directory creation
    logger.error(error)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const handleBilboMDMultiJobCreation = async (
  req: Request,
  res: Response,
  user: IUser,
  UUID: string
) => {
  logger.info(`Processing MultiJob creation for UUID: ${UUID}`)

  const bilbomd_uuids = req.body.bilbomd_uuids

  if (!Array.isArray(bilbomd_uuids) || bilbomd_uuids.length < 2) {
    logger.error('Invalid bilbomd_uuids: Must be an array with at least 2 elements')
    return res.status(400).json({
      message: 'bilbomd_uuids must be an array of at least 2 UUIDs'
    })
  }

  const invalidUUIDs = bilbomd_uuids.filter(
    (id) => !uuidValidate(id) || uuidVersion(id) !== 4
  )

  if (invalidUUIDs.length > 0) {
    logger.error(`Invalid UUIDs detected: ${invalidUUIDs.join(', ')}`)
    return res.status(400).json({
      message: `Invalid UUIDs detected: ${invalidUUIDs.join(
        ', '
      )}. All bilbomd_uuids must be valid v4 UUIDs.`
    })
  }

  try {
    // Create the MultiJob entry in MongoDB
    const newMultiJob = new MultiJob({
      title: req.body.title,
      uuid: UUID,
      bilbomd_uuids: bilbomd_uuids,
      data_file_from: req.body.data_file_from,
      user: user._id,
      status: 'Submitted',
      time_submitted: new Date()
    })

    await newMultiJob.save()
    logger.info(`New MultiJob created with UUID: ${UUID}`)

    // Could write out params.json here if needed for NERSC

    // Queue the MultiJob
    const BullId = await queueJob({
      type: 'BilboMDMultiJob',
      title: newMultiJob.title,
      uuid: newMultiJob.uuid,
      jobid: newMultiJob.id
    })
    logger.info(`MultiJob queued with BullId: ${BullId}`)

    return res.status(201).json({ message: 'MultiJob created successfully', uuid: UUID })
  } catch (error) {
    logger.error(`Failed to create MultiJob: ${error}`)
    return res.status(500).json({ message: 'Failed to create MultiJob entry' })
  }
}

export { createNewMultiJob }
