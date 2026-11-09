import path from 'path'
import { logger } from '../../middleware/loggers.js'
import {
  BilboMdBioEmuJob,
  IBilboMDBioEmuJob,
  IBioEmuEntity,
  IBioEmuParameters,
  IBilboMDSteps,
  StepStatus,
  IUser
} from '@bilbomd/mongodb-schema'
import { bioemuJobSchema } from '../../validation/index.js'
import { ValidationError } from 'yup'
import { Request, Response } from 'express'
import { writeJobParams, spawnAutoRgCalculator } from './index.js'
import { queueJob } from '../../queues/bilbomd.js'
import { parseOpenFoldEntities } from './utils/parseOpenFoldEntities.js'
import { createBioEmuSystemYaml } from './utils/createBioEmuSystemYaml.js'
import { calculateRgyrRange } from './utils/calculateRgyrRange.js'
import { config } from '../../config/config.js'
import { announceNewJob } from '../../services/announceNewJob.js'
import { serverFile } from './utils/serverFiles.js'
import { prepareSaxsDataFile, saxsDataError } from './utils/saxsData.js'

// BilboMD BioEmu2 (bilbomd#1200): sequence entities + SAXS data. BioEmu2
// samples structures steered to the AutoRg-derived Rg targets in place of MD,
// then FoXS/MultiFoXS fit them. While the pipeline is being validated it is
// behind ENABLE_BILBOMD_BIOEMU and limited to Admins; there is no UI form yet.

const uploadFolder = config.uploadDir

type AutoRgResults = {
  rg: number
  rg_min: number
  rg_max: number
}

// The Phase 0 "steer" config: 50 structures per Rg target, 50 denoising
// steps, 5 guidance steps, BioEmu2's default physicality potentials
const defaultBioEmuParameters = (rgs: number[]): IBioEmuParameters => ({
  rgs,
  num_samples_per_rg: 50,
  batch_size: 40,
  num_steps: 50,
  num_gd_steps: 5,
  rg_weight: 0.02,
  default_potentials: true
})

// Why a submission may not use the pipeline, or null if it may
const bioemuAccessError = (
  user: IUser | undefined,
  accessMode: 'user' | 'anonymous'
): { status: number; message: string } | null => {
  if (process.env.ENABLE_BILBOMD_BIOEMU !== 'true') {
    return {
      status: 403,
      message: 'The BilboMD BioEmu2 pipeline is not enabled on this server'
    }
  }
  if (accessMode !== 'user' || !user?.roles?.includes('Admin')) {
    return {
      status: 403,
      message:
        'The BilboMD BioEmu2 pipeline is in testing and open to administrators only'
    }
  }
  return null
}

const handleBilboMDBioEmuJob = async (
  req: Request,
  res: Response,
  user: IUser | undefined,
  UUID: string,
  ctx: {
    accessMode: 'user' | 'anonymous'
    publicId?: string
    client_ip_hash?: string
  }
): Promise<void> => {
  const accessError = bioemuAccessError(user, ctx.accessMode)
  if (accessError) {
    res.status(accessError.status).json({ message: accessError.message })
    return
  }

  const jobDir = path.join(uploadFolder, UUID)
  const md_engine = 'OpenMM' // only used to polish the final ensemble members
  const { bilbomd_mode: bilbomdMode } = req.body
  const files = req.files as { [fieldname: string]: Express.Multer.File[] }
  logger.info(`bilbomdMode: ${bilbomdMode}`)
  logger.info(`title: ${req.body.title}`)

  const datFile = files['dat_file']?.[0] ?? serverFile(req, jobDir, 'dat_file')

  // Convert to Å⁻¹ and trim before validation or AutoRg read the file
  const saxsData = await prepareSaxsDataFile(datFile, req.body.q_units)
  if (!saxsData.ok) {
    res.status(400).json(saxsDataError(saxsData.message))
    return
  }

  let parsedEntities: IBioEmuEntity[] = []
  try {
    parsedEntities = parseOpenFoldEntities(req.body)
    logger.info(`Parsed ${parsedEntities.length} BioEmu2 entities`)
  } catch (parseErr) {
    logger.error('Failed to parse entities_json or entities', parseErr)
    res
      .status(400)
      .json({ message: 'Invalid entities_json or malformed form data' })
    return
  }

  try {
    await bioemuJobSchema.validate(
      {
        title: req.body.title,
        bilbomd_mode: req.body.bilbomd_mode,
        email: req.body.email,
        dat_file: datFile,
        q_units: req.body.q_units,
        entities: parsedEntities
      },
      { abortEarly: false }
    )
  } catch (validationErr) {
    if (validationErr instanceof ValidationError) {
      logger.warn('BioEmu2 job payload validation failed', validationErr)
      res.status(400).json({
        message: 'Validation failed',
        errors: validationErr.inner?.map((err) => ({
          path: err.path,
          message: err.message
        }))
      })
      return
    }
    throw validationErr
  }

  try {
    const systemYamlFile = await createBioEmuSystemYaml(parsedEntities, jobDir)

    const datFileName = datFile
      ? datFile.originalname.toLowerCase()
      : 'missing.dat'
    const { rg, rg_min, rg_max }: AutoRgResults = await spawnAutoRgCalculator(
      jobDir,
      datFileName
    )

    const rgMinBound = BilboMdBioEmuJob.schema.path('rg_min')?.options.min ?? 10
    const rgMaxBound =
      BilboMdBioEmuJob.schema.path('rg_max')?.options.max ?? 100
    if (
      rg <= 0 ||
      rg_min < rgMinBound ||
      rg_max > rgMaxBound ||
      rg_min > rg ||
      rg > rg_max
    ) {
      logger.warn(
        `Invalid AutoRg values for job ${req.body.title || UUID}: ${JSON.stringify({ rg, rg_min, rg_max })}`
      )
      res.status(400).json({
        message:
          'Rg values calculated from your SAXS data are outside allowed bounds',
        autorgResults: { rg, rg_min, rg_max },
        schemaLimits: { rg_min: rgMinBound, rg_max: rgMaxBound }
      })
      return
    }

    const waiting = { status: StepStatus.Waiting, message: '' }
    const stepsInit: IBilboMDSteps = {
      autorg: {
        status: StepStatus.Success,
        message: `Rg: ${rg}, Rg_min: ${rg_min}, Rg_max: ${rg_max}`
      },
      bioemu: { ...waiting },
      foxs: { ...waiting },
      multifoxs: { ...waiting },
      polish: { ...waiting },
      results: { ...waiting },
      email: { ...waiting }
    }

    const newJob: IBilboMDBioEmuJob = new BilboMdBioEmuJob({
      title: req.body.title,
      uuid: UUID,
      data_file: datFileName,
      rg,
      rg_min,
      rg_max,
      bioemu_entities: parsedEntities,
      system_yaml_file: systemYamlFile,
      bioemu_parameters: defaultBioEmuParameters(
        calculateRgyrRange(rg_min, rg_max)
      ),
      conformational_sampling: 1,
      status: 'Submitted',
      time_submitted: new Date(),
      user,
      steps: stepsInit,
      md_engine,
      access_mode: ctx.accessMode
    })
    await newJob.save()
    logger.info(`${bilbomdMode} Job saved to MongoDB: ${newJob._id.toString()}`)

    await writeJobParams(newJob._id.toString())

    const BullId = await queueJob({
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob._id.toString()
    })
    await announceNewJob(newJob)
    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    res.status(200).json({
      message: `New BilboMD BioEmu2 Job successfully created`,
      saxs_warnings: saxsData.warnings,
      jobid: newJob._id.toString(),
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
    logger.error('handleBilboMDBioEmuJob error:', error)
    res.status(500).json({ message: msg })
  }
}

export {
  handleBilboMDBioEmuJob,
  // Exported for unit tests:
  bioemuAccessError,
  defaultBioEmuParameters
}
