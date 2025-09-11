import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { queueJob } from '../../queues/bilbomd.js'
import {
  IBilboMDCRDJob,
  IUser,
  JobStatus,
  StepStatus,
  BilboMdCRDJob,
  BilboMdPDBJob
} from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { ValidationError } from 'yup'
import { writeJobParams, sanitizeConstInpFile, getFileStats } from './utils/jobUtils.js'
import { maybeAutoCalculateRg } from './utils/maybeAutoCalculateRg.js'
import { crdJobSchema } from '../../validation/index.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const handleBilboMDClassicCRD = async (
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
    let { rg, rg_min, rg_max } = req.body

    let inpFileName = ''
    let datFileName = ''
    let crdFileName = ''
    let psfFileName = ''
    let crdFile
    let psfFile
    let datFile
    let inpFile

    const jobDir = path.join(uploadFolder, UUID)

    if (isResubmission && originalJobId) {
      let originalJob = await BilboMdCRDJob.findById(originalJobId)
      if (!originalJob) {
        originalJob = await BilboMdPDBJob.findById(originalJobId)
      }

      if (!originalJob) {
        res.status(404).json({ message: 'Original job not found' })
        return
      }
      // logger.info(`orig job: ${JSON.stringify(originalJob)}`)
      const originalDir = path.join(uploadFolder, originalJob.uuid)
      inpFileName = originalJob.const_inp_file
      datFileName = originalJob.data_file
      crdFileName = originalJob.crd_file
      psfFileName = originalJob.psf_file

      await fs.copy(path.join(originalDir, inpFileName), path.join(jobDir, inpFileName))
      await fs.copy(path.join(originalDir, datFileName), path.join(jobDir, datFileName))
      await fs.copy(path.join(originalDir, crdFileName), path.join(jobDir, crdFileName))
      await fs.copy(path.join(originalDir, psfFileName), path.join(jobDir, psfFileName))
      logger.info(
        `Resubmission: Copied files from original job ${originalJobId} to new job ${UUID}`
      )
      // Need to construct this synthetic Multer File object to appease validation functions.
      crdFile = {
        originalname: crdFileName,
        path: path.join(jobDir, crdFileName),
        size: getFileStats(path.join(jobDir, crdFileName)).size
      } as Express.Multer.File
      psfFile = {
        originalname: psfFileName,
        path: path.join(jobDir, psfFileName),
        size: getFileStats(path.join(jobDir, psfFileName)).size
      } as Express.Multer.File
      datFile = {
        originalname: datFileName,
        path: path.join(jobDir, datFileName),
        size: getFileStats(path.join(jobDir, datFileName)).size
      } as Express.Multer.File
      inpFile = {
        originalname: inpFileName,
        path: path.join(jobDir, inpFileName),
        size: getFileStats(path.join(jobDir, inpFileName)).size
      } as Express.Multer.File
    } else {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      crdFile = files['crd_file']?.[0]
      psfFile = files['psf_file']?.[0]
      inpFile = files['inp_file']?.[0]
      datFile = files['dat_file']?.[0]
      crdFileName = files['crd_file']?.[0]?.originalname.toLowerCase()
      psfFileName = files['psf_file']?.[0]?.originalname.toLowerCase()
      inpFileName = files['inp_file']?.[0]?.originalname.toLowerCase()
      datFileName = files['dat_file']?.[0]?.originalname.toLowerCase()

      const constInpFilePath = path.join(jobDir, inpFileName)
      const constInpOrigFilePath = path.join(jobDir, `${inpFileName}.orig`)
      await fs.copyFile(constInpFilePath, constInpOrigFilePath)
      await sanitizeConstInpFile(constInpFilePath)
    }
    // Calculate rg values if not provided
    const resolvedRgValues = await maybeAutoCalculateRg(
      { rg, rg_min, rg_max },
      !!req.apiUser,
      jobDir,
      datFileName
    )

    rg = resolvedRgValues.rg
    rg_min = resolvedRgValues.rg_min
    rg_max = resolvedRgValues.rg_max

    // Collect data for validation
    const jobPayload = {
      title: req.body.title,
      bilbomd_mode: bilbomdMode,
      email: req.body.email,
      dat_file: datFile,
      const_inp_file: inpFile,
      crd_file: crdFile,
      psf_file: psfFile,
      rg,
      rg_min,
      rg_max
    }

    // Validate
    try {
      await crdJobSchema.validate(jobPayload, { abortEarly: false })
    } catch (validationErr) {
      if (validationErr instanceof ValidationError) {
        logger.warn('Classic CRD/PSF job payload validation failed', validationErr)
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

    // Initialize BilboMdCRDJob Job Data
    const newJob: IBilboMDCRDJob = new BilboMdCRDJob({
      title: req.body.title,
      uuid: UUID,
      status: JobStatus.Submitted,
      data_file: datFileName,
      crd_file: crdFileName,
      psf_file: psfFileName,
      const_inp_file: inpFileName,
      conformational_sampling: req.body.num_conf,
      rg,
      rg_min,
      rg_max,
      time_submitted: new Date(),
      user,
      progress: 0,
      cleanup_in_progress: false,
      steps: {
        minimize: { status: StepStatus.Waiting, message: '' },
        initfoxs: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        dcd2pdb: { status: StepStatus.Waiting, message: '' },
        pdb_remediate: { status: StepStatus.Waiting, message: '' },
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

    // Respond with job details
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

    logger.error('handleBilboMDClassicCRD error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDClassicCRD }
