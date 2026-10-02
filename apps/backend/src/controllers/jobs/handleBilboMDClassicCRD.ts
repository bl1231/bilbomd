import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { queueJob } from '../../queues/bilbomd.js'
import {
  IBilboMDCRDJob,
  JobStatus,
  StepStatus,
  BilboMdCRDJob,
  IUser
} from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { ValidationError } from 'yup'
import { writeJobParams, sanitizeConstInpFile } from './utils/jobUtils.js'
import { maybeAutoCalculateRg } from './utils/maybeAutoCalculateRg.js'
import { crdJobSchema } from '../../validation/index.js'
import { buildCHARMMParameters } from './utils/charmmParams.js'
import { config } from '../../config/config.js'
import {
  validateInpConstraints,
  convertInpToYaml,
  extractConstraintsFromYaml,
  buildChainMolTypesFromInp
} from '@bilbomd/md-utils'
import { announceNewJob } from '../../services/announceNewJob.js'
import { isResubmitRequest } from './utils/resubmission.js'
import { serverFile } from './utils/serverFiles.js'

const uploadFolder = config.uploadDir

const handleBilboMDClassicCRD = async (
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

    // Extract md_engine and reject OpenMM early
    const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
    const md_engine: 'CHARMM' | 'OpenMM' =
      mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
    if (md_engine === 'OpenMM') {
      logger.warn(
        'handleBilboMDClassicCRD: md_engine=OpenMM is not supported for this pipeline'
      )
      return res.status(422).json({
        message:
          'md_engine=OpenMM is not supported for this version of the BilboMD pipeline. Please use CHARMM.'
      })
    }
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

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    crdFile = files['crd_file']?.[0]
    psfFile = files['psf_file']?.[0]
    inpFile = files['inp_file']?.[0]
    datFile = files['dat_file']?.[0]

    // Otherwise use a file the server placed in jobDir (example data or a
    // resubmission's reused file)
    if (!crdFile) crdFile = serverFile(req, jobDir, 'crd_file')
    if (!psfFile) psfFile = serverFile(req, jobDir, 'psf_file')
    if (!inpFile) inpFile = serverFile(req, jobDir, 'inp_file')
    if (!datFile) datFile = serverFile(req, jobDir, 'dat_file')

    crdFileName = crdFile?.originalname.toLowerCase() ?? ''
    psfFileName = psfFile?.originalname.toLowerCase() ?? ''
    inpFileName = inpFile?.originalname.toLowerCase() ?? ''
    datFileName = datFile?.originalname.toLowerCase() ?? ''

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
        logger.warn(
          'Classic CRD/PSF job payload validation failed',
          validationErr
        )
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

    // Keep the original upload and sanitize the working copy (only once the
    // inputs have passed validation)
    const constInpFilePath = path.join(jobDir, inpFileName)
    const constInpOrigFilePath = path.join(jobDir, `${inpFileName}.orig`)
    await fs.copyFile(constInpFilePath, constInpOrigFilePath)
    await sanitizeConstInpFile(constInpFilePath)

    // Initialize BilboMdCRDJob Job Data
    const jobData = {
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
      charmm_parameters: buildCHARMMParameters({
        ...req.body,
        rg_min,
        rg_max
      }),
      time_submitted: new Date(),
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
        ...(ctx.accessMode === 'user' && {
          email: { status: StepStatus.Waiting, message: '' }
        })
      },
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

    const newJob: IBilboMDCRDJob = new BilboMdCRDJob(jobData)

    // Save the job to the database
    await newJob.save()
    logger.info(
      `BilboMD-${bilbomdMode} Job saved to MongoDB: ${newJob._id.toString()}`
    )

    // Store MD constraints in MongoDB (CRD only supports CHARMM/const.inp)
    if (inpFile) {
      try {
        const constraintFilePath = path.join(jobDir, inpFileName)
        await validateInpConstraints(constraintFilePath)
        const yamlContent = await convertInpToYaml(constraintFilePath, logger)
        const mdConstraints = extractConstraintsFromYaml(yamlContent)
        newJob.md_constraints = {
          ...mdConstraints,
          chain_mol_types: await buildChainMolTypesFromInp(constraintFilePath)
        }
        await newJob.save()
        logger.info(
          `MD constraints stored in MongoDB for job ${newJob._id.toString()}`
        )
      } catch (constraintError) {
        logger.warn(
          `Failed to store MD constraints for job ${newJob._id.toString()}:`,
          constraintError
        )
        // Don't fail job creation if constraint storage fails
      }
    }

    // Write Job params for use by NERSC job script.
    await writeJobParams(newJob._id.toString())
    // Create BullMQ Job object
    const jobDataForQueue = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob._id.toString()
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
        message: `New BilboMD Classic w/CRD Job successfully created`,
        jobid: newJob._id.toString(),
        uuid: newJob.uuid,
        md_engine,
        publicId: ctx.publicId,
        resultUrl,
        resultPath
      })
    } else {
      res.status(200).json({
        message: `New BilboMD Classic w/CRD Job successfully created`,
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

    logger.error('handleBilboMDClassicCRD error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDClassicCRD }
