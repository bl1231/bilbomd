import path from 'path'
import fs from 'fs-extra'
import mongoose from 'mongoose'
import { logger } from '../../middleware/loggers.js'
import {
  BilboMdSANSJob,
  IBilboMDSANSJob,
  StepStatus,
  IBilboMDSteps
} from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { sanitizeConstInpFile, writeJobParams } from './index.js'
import { queueJob } from '../../queues/bilbomd.js'
import { DispatchUser } from '../../types/bilbomd.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const handleBilboMDSANSJob = async (
  req: Request,
  res: Response,
  user: DispatchUser | undefined,
  UUID: string,
  ctx: {
    accessMode: 'user' | 'anonymous'
    publicId?: string
    client_ip_hash?: string
  }
) => {
  const jobDir = path.join(uploadFolder, UUID)
  try {
    const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
    const md_engine: 'CHARMM' | 'OpenMM' =
      mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
    logger.info(`Selected md_engine: ${md_engine}`)
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

    let stepsInit: IBilboMDSteps

    if (md_engine === 'OpenMM') {
      stepsInit = {
        minimize: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        pepsisans: { status: StepStatus.Waiting, message: '' },
        gasans: { status: StepStatus.Waiting, message: '' },
        results: { status: StepStatus.Waiting, message: '' }
      }
    } else {
      stepsInit = {
        pdb2crd: { status: StepStatus.Waiting, message: '' },
        minimize: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        dcd2pdb: { status: StepStatus.Waiting, message: '' },
        pdb_remediate: { status: StepStatus.Waiting, message: '' },
        pepsisans: { status: StepStatus.Waiting, message: '' },
        gasans: { status: StepStatus.Waiting, message: '' },
        results: { status: StepStatus.Waiting, message: '' }
      }
    }

    const jobData = {
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
      time_submitted: new Date(),
      access_mode: ctx.accessMode,
      ...(user ? { user } : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { public_id: ctx.publicId }
        : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { client_ip_hash: ctx.client_ip_hash }
        : {}),
      steps: {
        ...stepsInit,
        ...(ctx.accessMode === 'user'
          ? { email: { status: StepStatus.Waiting, message: '' } }
          : {})
      }
    }

    const newJob: IBilboMDSANSJob = new BilboMdSANSJob(jobData)

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
      res
        .status(500)
        .json({ message: 'Failed to save the job to the database' })
      return
    }

    logger.info(`${bilbomdMode} Job saved to  MongoDB: ${newJob.id}`)

    // Write Job params for use by NERSC job script.
    await writeJobParams(newJob.id)

    // Create BullMQ Job object
    const jobDataForQueue = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob.id,
      md_engine
    }

    // Queue the job
    const BullId = await queueJob(jobDataForQueue)

    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    // Respond with job details
    if (ctx.accessMode === 'anonymous') {
      // Prefer an explicit public/frontend base URL, then the Origin header (e.g. http://localhost:3002),
      // and only fall back to the backend host as a last resort.
      const origin = req.get('origin')
      const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        origin ||
        `${req.protocol}://${req.get('host')}`

      const resultPath = `/results/${ctx.publicId}`
      const resultUrl = `${baseUrl}${resultPath}`

      res.status(200).json({
        message: `New BilboMD SANS Job successfully created`,
        jobid: newJob.id,
        uuid: newJob.uuid,
        md_engine,
        publicId: ctx.publicId,
        resultUrl,
        resultPath
      })
    } else {
      res.status(200).json({
        message: `New BilboMD SANS Job successfully created`,
        jobid: newJob.id,
        uuid: newJob.uuid,
        md_engine
      })
    }
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred'

    logger.error('handleBilboMDSANSJob error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDSANSJob }
