import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
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
import { writeJobParams, sanitizeConstInpFile } from './utils/jobUtils.js'
import { maybeAutoCalculateRg } from './utils/maybeAutoCalculateRg.js'
import { pdbJobSchema } from '../../validation/index.js'
import {
  convertInpToYaml,
  convertYamlToInp,
  validateYamlConstraints,
  validateInpConstraints,
  extractConstraintsFromYaml,
  buildChainSegidMap,
  buildChainMolTypes
} from '@bilbomd/md-utils'
import { buildOpenMMParameters } from './utils/openmmParams.js'
import { buildCHARMMParameters } from './utils/charmmParams.js'
import { config } from '../../config/config.js'
import { announceNewJob } from '../../services/announceNewJob.js'
import { isResubmitRequest } from './utils/resubmission.js'
import { serverFile } from './utils/serverFiles.js'
import { prepareSaxsDataFile, saxsDataError } from './utils/saxsData.js'

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

    let inpFileName = ''
    let datFileName = ''
    let pdbFileName = ''
    let pdbFile
    let datFile
    let inpFile

    const jobDir = path.join(uploadFolder, UUID)

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    pdbFile = files['pdb_file']?.[0]
    inpFile = files['inp_file']?.[0] || files['omm_const_file']?.[0] // Accept either file type
    datFile = files['dat_file']?.[0]

    // Otherwise use a file the server placed in jobDir (example data or a
    // resubmission's reused file)
    if (!pdbFile) pdbFile = serverFile(req, jobDir, 'pdb_file')
    if (!inpFile) inpFile = serverFile(req, jobDir, 'inp_file')
    if (!datFile) datFile = serverFile(req, jobDir, 'dat_file')

    pdbFileName = pdbFile?.originalname.toLowerCase() ?? ''
    inpFileName = inpFile?.originalname.toLowerCase() ?? ''
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
      const_inp_file: inpFile,
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

    // Handle constraint file processing AFTER validation
    if (inpFile) {
      const standardizedFileName = await processConstraintFile({
        md_engine,
        jobDir,
        inpFile,
        inpFileName,
        pdbFilePath: path.join(jobDir, pdbFileName)
      })
      // Update inpFileName to reflect the standardized output filename
      inpFileName = standardizedFileName
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
      const_inp_file: inpFileName,
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

    // Store MD constraints in MongoDB if constraint file was processed
    if (inpFile) {
      try {
        const constraintFilePath = path.join(jobDir, inpFileName)
        const isYamlConstraint = inpFileName.endsWith('.yml')

        let yamlContent: string
        if (isYamlConstraint) {
          // Read and validate YAML constraint file
          await validateYamlConstraints(constraintFilePath)
          yamlContent = await fs.readFile(constraintFilePath, 'utf8')
        } else {
          // Convert INP to YAML for consistent storage
          await validateInpConstraints(constraintFilePath)
          yamlContent = await convertInpToYaml(constraintFilePath, logger)
        }

        // Parse YAML content to structured object
        const mdConstraints = extractConstraintsFromYaml(yamlContent)

        // Update the job with MD constraints
        newJob.md_constraints = {
          ...mdConstraints,
          chain_mol_types: await buildChainMolTypes(
            path.join(jobDir, pdbFileName)
          )
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
        // Don't fail the job creation if constraint storage fails
      }
    }

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

// A resubmission reuses the original job's already-standardized constraint
// file, so the source may already be at the standardized path.
const copyUnlessSame = async (src: string, dest: string) => {
  if (path.resolve(src) !== path.resolve(dest)) await fs.copyFile(src, dest)
}

// Helper function to process constraint files based on MD engine
async function processConstraintFile({
  md_engine,
  jobDir,
  inpFile,
  inpFileName,
  pdbFilePath
}: {
  md_engine: 'CHARMM' | 'OpenMM'
  jobDir: string
  inpFile: Express.Multer.File
  inpFileName: string
  pdbFilePath: string
}): Promise<string> {
  const filePath = inpFile.path // Use the actual uploaded file path

  // Determine standardized output filename based on MD engine
  const standardizedFileName =
    md_engine === 'OpenMM' ? 'openmm_const.yml' : 'const.inp'
  const finalPath = path.join(jobDir, standardizedFileName)
  const originalFilePath = path.join(jobDir, `${inpFileName}.orig`)

  // Always keep original - copy from uploaded location with original name + .orig extension
  await fs.copyFile(filePath, originalFilePath)

  // Determine file type by extension or content
  const isYamlFile =
    inpFileName.endsWith('.yaml') || inpFileName.endsWith('.yml')

  if (md_engine === 'OpenMM') {
    if (!isYamlFile) {
      // Convert CHARMM INP to YAML for OpenMM
      logger.info('Converting INP file to YAML for OpenMM')
      await validateInpConstraints(filePath)
      const yamlContent = await convertInpToYaml(filePath, logger)

      // Write YAML content to standardized filename
      await fs.writeFile(finalPath, yamlContent)
      logger.info(
        `INP file converted to YAML for OpenMM: ${standardizedFileName}`
      )
    } else {
      // Validate YAML file and copy to standardized filename
      logger.info('Validating YAML constraints file for OpenMM')
      await validateYamlConstraints(filePath)
      await copyUnlessSame(filePath, finalPath)
      logger.info(
        `YAML constraints file validated for OpenMM: ${standardizedFileName}`
      )
    }
  } else if (md_engine === 'CHARMM') {
    if (isYamlFile) {
      // Convert YAML to INP for CHARMM
      logger.info('Converting YAML file to INP for CHARMM')
      await validateYamlConstraints(filePath)
      // Build chain→segid map from the PDB so DNA/RNA chains get the correct
      // pdb2crd-style segid (e.g. "DNAD") rather than defaulting to "PROD".
      const chainSegidMap = await buildChainSegidMap(pdbFilePath)
      logger.info(`Chain→segid map: ${JSON.stringify(chainSegidMap)}`)
      const inpContent = await convertYamlToInp(filePath, logger, chainSegidMap)

      // Write INP content to standardized filename
      await fs.writeFile(finalPath, inpContent)
      await sanitizeConstInpFile(finalPath)
      logger.info(
        `YAML file converted to INP for CHARMM: ${standardizedFileName}`
      )
    } else {
      // Process INP file for CHARMM
      logger.info('Processing INP file for CHARMM')
      await validateInpConstraints(filePath)

      // Copy to standardized filename and then sanitize
      await copyUnlessSame(filePath, finalPath)
      await sanitizeConstInpFile(finalPath)
      logger.info(`INP file processed for CHARMM: ${standardizedFileName}`)
    }
  }

  return standardizedFileName
}

export { handleBilboMDClassicPDB }
