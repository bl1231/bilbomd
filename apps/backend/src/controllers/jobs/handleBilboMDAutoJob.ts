import { logger } from '../../middleware/loggers.js'
import { config } from '../../config/config.js'
import path from 'path'
import { queueJob } from '../../queues/bilbomd.js'
import {
  queueJob as queuePdb2CrdJob,
  waitForJobCompletion,
  pdb2crdQueueEvents
} from '../../queues/pdb2crd.js'
import {
  IUser,
  BilboMdAutoJob,
  IBilboMDAutoJob,
  JobStatus,
  StepStatus
} from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { ValidationError } from 'yup'
import { AutoRgResults } from '../../types/bilbomd.js'
import { writeJobParams, getFileStats } from './utils/jobUtils.js'
import { spawnAutoRgCalculator } from './utils/autoRg.js'
import fs from 'fs-extra'
import { autoJobSchema } from '../../validation/index.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const handleBilboMDAutoJob = async (
  req: Request,
  res: Response,
  user: IUser,
  UUID: string
) => {
  try {
    const isResubmission = Boolean(
      req.body.resubmit === true || req.body.resubmit === 'true'
    )
    const originalJobId = req.body.original_job_id || null
    logger.info(`isResubmission: ${isResubmission}, originalJobId: ${originalJobId}`)

    const { bilbomd_mode: bilbomdMode } = req.body

    let pdbFileName = ''
    let paeFileName = ''
    let datFileName = ''
    let pdbFile
    let paeFile
    let datFile

    const jobDir = path.join(uploadFolder, UUID)

    if (isResubmission && originalJobId) {
      const originalJob = await BilboMdAutoJob.findById(originalJobId)
      if (!originalJob) {
        res.status(404).json({ message: 'Original job not found' })
        return
      }

      const originalDir = path.join(uploadFolder, originalJob.uuid)

      pdbFileName = originalJob.pdb_file
      paeFileName = originalJob.pae_file
      datFileName = originalJob.data_file

      await fs.copy(path.join(originalDir, pdbFileName), path.join(jobDir, pdbFileName))
      await fs.copy(path.join(originalDir, paeFileName), path.join(jobDir, paeFileName))
      await fs.copy(path.join(originalDir, datFileName), path.join(jobDir, datFileName))
      logger.info(
        `Resubmission: Copied files from original job ${originalJobId} to new job ${UUID}`
      )
      // Need to construct this synthetic Multer File object to appease validation functions.
      pdbFile = {
        originalname: pdbFileName,
        path: path.join(jobDir, pdbFileName),
        size: getFileStats(path.join(jobDir, pdbFileName)).size
      } as Express.Multer.File
      paeFile = {
        originalname: paeFileName,
        path: path.join(jobDir, paeFileName),
        size: getFileStats(path.join(jobDir, paeFileName)).size
      } as Express.Multer.File
      datFile = {
        originalname: datFileName,
        path: path.join(jobDir, datFileName),
        size: getFileStats(path.join(jobDir, datFileName)).size
      } as Express.Multer.File
    } else {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      pdbFile = files['pdb_file']?.[0]
      paeFile = files['pae_file']?.[0]
      datFile = files['dat_file']?.[0]
      pdbFileName = files['pdb_file']?.[0]?.originalname.toLowerCase()
      paeFileName = files['pae_file']?.[0]?.originalname.toLowerCase()
      datFileName = files['dat_file']?.[0]?.originalname.toLowerCase()
    }

    logger.info(`PDB File: ${pdbFileName}`)
    logger.info(`PAE File: ${paeFileName}`)

    const autorgResults: AutoRgResults = await spawnAutoRgCalculator(jobDir, datFileName)

    // Collect data for validation
    const jobPayload = {
      title: req.body.title,
      bilbomd_mode: bilbomdMode,
      email: req.body.email,
      pdb_file: pdbFile,
      pae_file: paeFile,
      dat_file: datFile,
      rg: autorgResults.rg,
      rg_min: autorgResults.rg_min,
      rg_max: autorgResults.rg_max
    }

    // Validate
    try {
      await autoJobSchema.validate(jobPayload, { abortEarly: false })
    } catch (validationErr) {
      if (validationErr instanceof ValidationError) {
        logger.warn('Auto job payload validation failed', validationErr)
        return res.status(400).json({
          message: 'Validation failed',
          errors: validationErr.inner?.map((err) => ({
            path: err.path,
            message: err.message
          }))
        })
      } else {
        throw validationErr
      }
    }

    // Initialize BilboMdAuto Job Data
    const newJob: IBilboMDAutoJob = new BilboMdAutoJob({
      title: req.body.title,
      uuid: UUID,
      status: JobStatus.Submitted,
      pdb_file: pdbFileName,
      pae_file: paeFileName,
      data_file: datFileName,
      rg: autorgResults.rg,
      rg_min: autorgResults.rg_min,
      rg_max: autorgResults.rg_max,
      conformational_sampling: 3,
      time_submitted: new Date(),
      user: user,
      steps: {
        pdb2crd: { status: StepStatus.Waiting, message: '' },
        pae: { status: StepStatus.Waiting, message: '' },
        autorg: { status: StepStatus.Waiting, message: '' },
        minimize: { status: StepStatus.Waiting, message: '' },
        initfoxs: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        dcd2pdb: { status: StepStatus.Waiting, message: '' },
        foxs: { status: StepStatus.Waiting, message: '' },
        multifoxs: { status: StepStatus.Waiting, message: '' },
        results: { status: StepStatus.Waiting, message: '' },
        email: { status: StepStatus.Waiting, message: '' }
      },
      ...(isResubmission && originalJobId ? { resubmitted_from: originalJobId } : {})
    })

    // Save the job to the database
    await newJob.save()
    logger.info(`BilboMD-${bilbomdMode} Job saved to MongoDB: ${newJob.id}`)

    // Write Job params for use by NERSC job script.
    await writeJobParams(newJob.id)

    // ---------------------------------------------------------- //
    // Convert PDB to PSF and CRD
    if (!config.runOnNERSC) {
      const Pdb2CrdBullId = await queuePdb2CrdJob({
        type: 'Pdb2Crd',
        title: 'convert PDB to CRD',
        uuid: UUID,
        pdb_file: pdbFileName,
        pae_power: '2.0',
        plddt_cutoff: '50'
      })
      logger.info(`Pdb2Crd Job assigned UUID: ${UUID}`)
      logger.info(`Pdb2Crd Job assigned BullMQ ID: ${Pdb2CrdBullId}`)

      // Need to wait here until the BullMQ job is finished
      await waitForJobCompletion(Pdb2CrdBullId, pdb2crdQueueEvents)
      logger.info('Pdb2Crd completed.')
    }
    // ---------------------------------------------------------- //

    // Add PSF and CRD files to Mongo entry
    newJob.psf_file = 'bilbomd_pdb2crd.psf'
    newJob.crd_file = 'bilbomd_pdb2crd.crd'
    await newJob.save()

    // Create BullMQ Job object
    const jobData = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob.id
    }

    // Queue the job
    const BullId = await queueJob(jobData)

    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    res.status(200).json({
      message: `New ${bilbomdMode} Job successfully created`,
      jobid: newJob.id,
      uuid: newJob.uuid
    })
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Unknown error occurred'

    logger.error('handleBilboMDAutoJob error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDAutoJob }
