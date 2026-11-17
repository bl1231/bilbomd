import { logger } from '../../middleware/loggers.js'
import path from 'path'
import { queueJob } from '../../queues/bilbomd.js'
import {
  IBilboMDPDBJob,
  JobStatus,
  StepStatus,
  BilboMdPDBJob,
  IBilboMDSteps,
  IUser
} from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { ValidationError } from 'yup'
import { writeJobParams } from './utils/jobUtils.js'
import { maybeAutoCalculateRg } from './utils/maybeAutoCalculateRg.js'
import { pdbJobSchema } from '../../validation/index.js'
import { buildOpenMMParameters } from './utils/openmmParams.js'
import { buildCHARMMParameters } from './utils/charmmParams.js'
import { config } from '../../config/config.js'
import { announceNewJob } from '../../services/announceNewJob.js'
import { isResubmitRequest } from './utils/resubmission.js'
import { serverFile } from './utils/serverFiles.js'
import { prepareSaxsDataFile, saxsDataError } from './utils/saxsData.js'
import { materializeConstraints } from './utils/constraints.js'

const uploadFolder = config.uploadDir

const handleBilboMDClassicPDB = async (
  req: Request,
  res: Response,
  user: IUser | undefined,
  UUID: string,
  ctx: {
    accessMode: 'user' | 'anonymous'
    publicId?: string
    client_ip_hash?: string
  }
) => {
  try {
    // Reused files were already copied into jobDir by prepareResubmission
    const originalJobId: string | null = isResubmitRequest(req)
      ? req.body.original_job_id
      : null

    const { bilbomd_mode: bilbomdMode } = req.body

    // Normalize md_engine (default to 'charmm' if not provided/unknown)
    const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
    const md_engine: 'CHARMM' | 'OpenMM' =
      mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
    logger.info(`Selected md_engine: ${md_engine}`)

    let { rg, rg_min, rg_max } = req.body

    let datFileName = ''
    let pdbFileName = ''
    let pdbFile
    let datFile
    let inpFile

    const jobDir = path.join(uploadFolder, UUID)

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    pdbFile = files['pdb_file']?.[0]
    inpFile = files['inp_file']?.[0]
    datFile = files['dat_file']?.[0]

    // Otherwise use a file the server placed in jobDir (example data or a
    // resubmission's reused file)
    if (!pdbFile) pdbFile = serverFile(req, jobDir, 'pdb_file')
    if (!inpFile) inpFile = serverFile(req, jobDir, 'inp_file')
    if (!datFile) datFile = serverFile(req, jobDir, 'dat_file')

    pdbFileName = pdbFile?.originalname.toLowerCase() ?? ''
    datFileName = datFile?.originalname.toLowerCase() ?? ''

    // Convert to Å⁻¹ and trim before AutoRg or validation read the file
    const saxsData = await prepareSaxsDataFile(datFile, req.body.q_units)
    if (!saxsData.ok) {
      return res.status(400).json(saxsDataError(saxsData.message))
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
      q_units: req.body.q_units,
      pdb_file: pdbFile,
      rg,
      rg_min,
      rg_max,
      md_engine
    }

    // Validate FIRST (before processing constraint files)
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

    // Validate the constraints against the structure and write the only
    // constraint file the MD engine will read
    const constraints = await materializeConstraints({
      mode: 'pdb',
      md_engine,
      jobDir,
      structureFile: path.join(jobDir, pdbFileName),
      constraintsField: req.body.constraints,
      legacyFile: inpFile
    })
    if (!constraints.ok) {
      logger.warn('Classic PDB job constraints rejected', constraints.errors)
      return res
        .status(400)
        .json({ message: 'Validation failed', errors: constraints.errors })
    }

    let stepsInit: IBilboMDSteps

    if (md_engine === 'OpenMM') {
      stepsInit = {
        minimize: { status: StepStatus.Waiting, message: '' },
        initfoxs: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        foxs: { status: StepStatus.Waiting, message: '' },
        multifoxs: { status: StepStatus.Waiting, message: '' },
        results: { status: StepStatus.Waiting, message: '' },
        ...(ctx.accessMode === 'user' && {
          email: { status: StepStatus.Waiting, message: '' }
        })
      }
    } else {
      stepsInit = {
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
        ...(ctx.accessMode === 'user' && {
          email: { status: StepStatus.Waiting, message: '' }
        })
      }
    }

    // Initialize BilboMdPDBJob Job Data
    const jobData = {
      title: req.body.title,
      uuid: UUID,
      status: JobStatus.Submitted,
      data_file: datFileName,
      pdb_file: pdbFileName,
      const_inp_file: constraints.constFileName,
      md_constraints: constraints.md_constraints,
      conformational_sampling: req.body.num_conf,
      rg,
      rg_min,
      rg_max,
      time_submitted: new Date(),
      progress: 0,
      cleanup_in_progress: false,
      steps: stepsInit,
      md_engine,
      ...(md_engine === 'OpenMM' && {
        openmm_parameters: buildOpenMMParameters({
          ...req.body,
          rg_min,
          rg_max
        })
      }),
      ...(md_engine === 'CHARMM' && {
        charmm_parameters: buildCHARMMParameters({
          ...req.body,
          rg_min,
          rg_max
        })
      }),
      ...(originalJobId ? { resubmitted_from: originalJobId } : {}),
      access_mode: ctx.accessMode,
      ...(user ? { user } : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { public_id: ctx.publicId }
        : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { client_ip_hash: ctx.client_ip_hash }
        : {})
    }

    const newJob: IBilboMDPDBJob = new BilboMdPDBJob(jobData)

    // Save the job to the database
    await newJob.save()
    logger.info(
      `BilboMD-${bilbomdMode} Job saved to MongoDB: ${newJob._id.toString()}`
    )

    // Write Job params for use by NERSC job script.
    await writeJobParams(newJob._id.toString())

    // Create BullMQ Job object
    const jobDataForQueue = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob._id.toString(),
      md_engine
    }

    // Queue the job
    const BullId = await queueJob(jobDataForQueue)
    await announceNewJob(newJob)

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
        message: `New BilboMD Classic w/PDB Job successfully created`,
        saxs_warnings: saxsData.warnings,
        constraint_warnings: constraints.warnings,
        jobid: newJob._id.toString(),
        uuid: newJob.uuid,
        md_engine,
        publicId: ctx.publicId,
        resultUrl,
        resultPath
      })
    } else {
      res.status(200).json({
        message: `New BilboMD Classic w/PDB Job successfully created`,
        saxs_warnings: saxsData.warnings,
        constraint_warnings: constraints.warnings,
        jobid: newJob._id.toString(),
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

    logger.error('handleBilboMDClassicPDB error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDClassicPDB }
