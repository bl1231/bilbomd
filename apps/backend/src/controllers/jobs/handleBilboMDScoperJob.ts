import { logger } from '../../middleware/loggers.js'
import { queueScoperJob } from '../../queues/scoper.js'
import {
  IUser,
  BilboMdScoperJob,
  IBilboMDScoperJob
} from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'

const handleBilboMDScoperJob = async (
  req: Request,
  res: Response,
  user: IUser,
  UUID: string
) => {
  try {
    const { bilbomd_mode: bilbomdMode, title, fixc1c2 } = req.body
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    logger.info(
      `PDB File: ${
        files['pdb_file'] ? files['pdb_file'][0].originalname.toLowerCase() : 'Not Found'
      }`
    )
    logger.info(
      `DAT File: ${
        files['dat_file'] ? files['dat_file'][0].originalname.toLowerCase() : 'Not Found'
      }`
    )
    const now = new Date()
    logger.info(`fixc1c2: ${fixc1c2}`)
    const newJob: IBilboMDScoperJob = new BilboMdScoperJob({
      title,
      uuid: UUID,
      pdb_file: files['pdb_file'][0].originalname.toLowerCase(),
      data_file: files['dat_file'][0].originalname.toLowerCase(),
      fixc1c2,
      status: 'Submitted',
      time_submitted: now,
      user: user,
      steps: {
        pdb2crd: {},
        pae: {},
        autorg: {},
        minimize: {},
        initfoxs: {},
        heat: {},
        md: {},
        dcd2pdb: {},
        foxs: {},
        multifoxs: {},
        results: {},
        email: {}
      }
    })
    // logger.info(`in handleBilboMDScoperJob: ${newJob}`)
    // Save the job to the database
    await newJob.save()
    logger.info(`${bilbomdMode} Job saved to MongoDB: ${newJob.id}`)

    // Queue the job
    const BullId = await queueScoperJob({
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
    // Log more detailed information about the error
    if (error instanceof Error) {
      logger.error(`Error in handleBilboMDScoperJob: ${error.message}`)
      logger.error(`Stack Trace: ${error.stack}`)
    } else {
      logger.error(`Non-standard error object: {error}`)
    }
    res.status(500).json({ message: 'Failed to create handleBilboMDScoperJob job' })
  }
}

export { handleBilboMDScoperJob }
