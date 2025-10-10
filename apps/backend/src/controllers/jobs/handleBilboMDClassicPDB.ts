import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { queueJob } from '../../queues/bilbomd.js'
import {
  IBilboMDPDBJob,
  IUser,
  JobStatus,
  StepStatus,
  BilboMdPDBJob,
  BilboMdCRDJob,
  IBilboMDSteps
} from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { ValidationError } from 'yup'
import {
  writeJobParams,
  sanitizeConstInpFile,
  getFileStats
} from './utils/jobUtils.js'
import { maybeAutoCalculateRg } from './utils/maybeAutoCalculateRg.js'
import { pdbJobSchema } from '../../validation/index.js'
import {
  convertInpToYaml,
  convertYamlToInp,
  validateYamlConstraints,
  validateInpConstraints
} from './utils/constraintUtils.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const handleBilboMDClassicPDB = async (
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
    logger.info(
      `isResubmission: ${isResubmission}, originalJobId: ${originalJobId}`
    )

    const { bilbomd_mode: bilbomdMode } = req.body

    // Normalize md_engine (default to 'charmm' if not provided/unknown)
    const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
    const md_engine: 'CHARMM' | 'OpenMM' =
      mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
    logger.info(`Selected md_engine: ${md_engine}`)

    let { rg, rg_min, rg_max } = req.body

    let inpFileName = ''
    let datFileName = ''
    let pdbFileName = ''
    let pdbFile
    let datFile
    let inpFile

    const jobDir = path.join(uploadFolder, UUID)

    if (isResubmission && originalJobId) {
      let originalJob = await BilboMdPDBJob.findById(originalJobId)
      if (!originalJob) {
        originalJob = await BilboMdCRDJob.findById(originalJobId)
      }

      if (!originalJob) {
        res.status(404).json({ message: 'Original job not found' })
        return
      }
      const originalDir = path.join(uploadFolder, originalJob.uuid)

      inpFileName = originalJob.const_inp_file
      datFileName = originalJob.data_file
      pdbFileName = originalJob.pdb_file

      await fs.copy(
        path.join(originalDir, inpFileName),
        path.join(jobDir, inpFileName)
      )
      await fs.copy(
        path.join(originalDir, datFileName),
        path.join(jobDir, datFileName)
      )
      await fs.copy(
        path.join(originalDir, pdbFileName),
        path.join(jobDir, pdbFileName)
      )

      logger.info(
        `Resubmission: Copied files from original job ${originalJobId} to new job ${UUID}`
      )

      // Need to construct synthetic Multer File objects
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

      pdbFile = {
        originalname: pdbFileName,
        path: path.join(jobDir, pdbFileName),
        size: getFileStats(path.join(jobDir, pdbFileName)).size
      } as Express.Multer.File
    } else {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      pdbFile = files['pdb_file']?.[0]
      inpFile = files['inp_file']?.[0] || files['omm_const_file']?.[0] // Accept either file type
      datFile = files['dat_file']?.[0]

      pdbFileName = pdbFile?.originalname.toLowerCase()
      inpFileName = inpFile?.originalname.toLowerCase()
      datFileName = datFile?.originalname.toLowerCase()

      // Handle constraint file processing based on md_engine and available files
      if (inpFile) {
        await processConstraintFile({
          md_engine,
          jobDir,
          inpFile,
          inpFileName
        })
      }
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
      pdb_file: pdbFile,
      rg,
      rg_min,
      rg_max,
      md_engine
    }

    // Validate
    try {
      await pdbJobSchema.validate(jobPayload, { abortEarly: false })
    } catch (validationErr) {
      if (validationErr instanceof ValidationError) {
        logger.warn('Classic PDB job payload validation failed', validationErr)
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

    // Build default steps, allow minor tweaks based on md_engine
    const stepsInit: IBilboMDSteps = {
      pdb2crd: { status: StepStatus.Waiting, message: '' },
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
    } as const

    // If using OpenMM, note that pdb2crd is not needed and will be skipped downstream.
    const stepsAdjusted = {
      ...stepsInit,
      pdb2crd: {
        ...stepsInit.pdb2crd,
        message: md_engine === 'OpenMM' ? 'Skipped for OpenMM md_engine' : ''
      }
    }

    // Initialize BilboMdPDBJob Job Data
    const newJob: IBilboMDPDBJob = new BilboMdPDBJob({
      title: req.body.title,
      uuid: UUID,
      status: JobStatus.Submitted,
      data_file: datFileName,
      pdb_file: pdbFileName,
      const_inp_file: inpFileName,
      conformational_sampling: req.body.num_conf,
      rg,
      rg_min,
      rg_max,
      time_submitted: new Date(),
      user,
      progress: 0,
      cleanup_in_progress: false,
      steps: stepsAdjusted,
      md_engine,
      ...(isResubmission && originalJobId
        ? { resubmitted_from: originalJobId }
        : {})
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
      jobid: newJob.id,
      md_engine
    }

    // Queue the job
    const BullId = await queueJob(jobData)

    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    // Respond with job details
    res.status(200).json({
      message: `New ${bilbomdMode} Job successfully created`,
      jobid: newJob.id,
      uuid: newJob.uuid,
      md_engine
    })
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred'

    logger.error('handleBilboMDClassicPDB error:', error)
    res.status(500).json({ message: msg })
  }
}

// Helper function to process constraint files based on MD engine
async function processConstraintFile({
  md_engine,
  jobDir,
  inpFile,
  inpFileName
}: {
  md_engine: 'CHARMM' | 'OpenMM'
  jobDir: string
  inpFile: Express.Multer.File
  inpFileName: string
}) {
  const filePath = inpFile.path // Use the actual uploaded file path
  const finalPath = path.join(jobDir, inpFileName) // Where the file should end up
  const originalFilePath = path.join(jobDir, `${inpFileName}.orig`)

  // Always keep original - copy from uploaded location to final location with .orig extension
  await fs.copyFile(filePath, originalFilePath)

  // Determine file type by extension or content
  const isYamlFile =
    inpFileName.endsWith('.yaml') || inpFileName.endsWith('.yml')

  if (md_engine === 'OpenMM') {
    if (!isYamlFile) {
      // Convert CHARMM INP to YAML for OpenMM
      logger.info('Converting INP file to YAML for OpenMM')
      await validateInpConstraints(filePath)
      const yamlContent = await convertInpToYaml(filePath)

      // Write YAML content to final path
      await fs.writeFile(finalPath, yamlContent)
      logger.info('INP file converted to YAML for OpenMM')
    } else {
      // Validate YAML file and copy to final location
      logger.info('Validating YAML constraints file for OpenMM')
      await validateYamlConstraints(filePath)
      await fs.copyFile(filePath, finalPath)
      logger.info('YAML constraints file validated for OpenMM')
    }
  } else if (md_engine === 'CHARMM') {
    if (isYamlFile) {
      // Convert YAML to INP for CHARMM
      logger.info('Converting YAML file to INP for CHARMM')
      await validateYamlConstraints(filePath)
      const inpContent = await convertYamlToInp(filePath)

      // Write INP content to final path
      await fs.writeFile(finalPath, inpContent)
      await sanitizeConstInpFile(finalPath)
      logger.info('YAML file converted to INP for CHARMM')
    } else {
      // Process INP file for CHARMM
      logger.info('Processing INP file for CHARMM')
      await validateInpConstraints(filePath)

      // Copy to final location and then sanitize
      await fs.copyFile(filePath, finalPath)
      await sanitizeConstInpFile(finalPath)
      logger.info('INP file processed for CHARMM')
    }
  }
}

export { handleBilboMDClassicPDB }
