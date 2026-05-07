import path from 'path'
import { logger } from '../../middleware/loggers.js'
import {
  BilboMdOpenFoldJob,
  IBilboMDOpenFoldJob,
  IOpenFoldEntity,
  IBilboMDSteps,
  StepStatus,
  IUser
} from '@bilbomd/mongodb-schema'
import { openfoldJobSchema } from '../../validation/index.js'
import { ValidationError } from 'yup'
import { Request, Response } from 'express'
import { writeJobParams, spawnAutoRgCalculator } from './index.js'
import { getFileStats } from './utils/jobUtils.js'
import { queueJob } from '../../queues/bilbomd.js'
import { createOpenFoldQueryJson } from './utils/createOpenFoldQueryJson.js'
import { parseOpenFoldEntities } from './utils/parseOpenFoldEntities.js'
import { buildOpenMMParameters } from './utils/openmmParams.js'
import { config } from '../../config/config.js'

const uploadFolder = config.uploadDir

type AutoRgResults = {
  rg: number
  rg_min: number
  rg_max: number
}

const handleBilboMDOpenFoldJob = async (
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
  const jobDir = path.join(uploadFolder, UUID)
  const md_engine = 'OpenMM'

  const { bilbomd_mode: bilbomdMode } = req.body
  const files = req.files as { [fieldname: string]: Express.Multer.File[] }
  logger.info(`bilbomdMode: ${bilbomdMode}`)
  logger.info(`title: ${req.body.title}`)

  let datFile = files['dat_file']?.[0]
  if (!datFile && req.body.dat_file) {
    datFile = {
      originalname: req.body.dat_file,
      path: path.join(jobDir, req.body.dat_file),
      size: getFileStats(path.join(jobDir, req.body.dat_file)).size
    } as Express.Multer.File
  }

  let parsedEntities: IOpenFoldEntity[] = []

  try {
    parsedEntities = parseOpenFoldEntities(req.body)
    logger.info(`Parsed ${parsedEntities.length} OpenFold3 entities`)
  } catch (parseErr) {
    logger.error('Failed to parse entities_json or reconstruct entities', parseErr)
    res
      .status(400)
      .json({ message: 'Invalid entities_json or malformed form data' })
    return
  }

  const jobPayload = {
    title: req.body.title,
    bilbomd_mode: req.body.bilbomd_mode,
    email: req.body.email,
    dat_file: datFile,
    entities: parsedEntities
  }

  try {
    await openfoldJobSchema.validate(jobPayload, { abortEarly: false })
  } catch (validationErr) {
    if (validationErr instanceof ValidationError) {
      logger.warn('OpenFold job payload validation failed', validationErr)
      res.status(400).json({
        message: 'Validation failed',
        errors: validationErr.inner?.map((err) => ({
          path: err.path,
          message: err.message
        }))
      })
      return
    } else {
      throw validationErr
    }
  }

  await createOpenFoldQueryJson(parsedEntities, jobDir)

  try {
    const datFileName = datFile
      ? datFile.originalname.toLowerCase()
      : 'missing.dat'

    const { rg, rg_min, rg_max }: AutoRgResults = await spawnAutoRgCalculator(
      jobDir,
      datFileName
    )

    const rgMinBound =
      BilboMdOpenFoldJob.schema.path('rg_min')?.options.min ?? 10
    const rgMaxBound =
      BilboMdOpenFoldJob.schema.path('rg_max')?.options.max ?? 100

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
        message: 'Rg values calculated from your SAXS data are outside allowed bounds',
        autorgResults: { rg, rg_min, rg_max },
        schemaLimits: { rg_min: rgMinBound, rg_max: rgMaxBound }
      })
      return
    }

    const autorgStep = {
      status: StepStatus.Success,
      message: `Rg: ${rg}, Rg_min: ${rg_min}, Rg_max: ${rg_max}`
    }

    const stepsInit: IBilboMDSteps = {
      openfold: { status: StepStatus.Waiting, message: '' },
      pae: { status: StepStatus.Waiting, message: '' },
      autorg: autorgStep,
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

    const jobData = {
      title: req.body.title,
      uuid: UUID,
      data_file: datFileName,
      rg,
      rg_min,
      rg_max,
      query_json_file: 'of3-query.json',
      openfold_entities: parsedEntities,
      conformational_sampling: 3,
      status: 'Submitted',
      time_submitted: new Date(),
      user,
      steps: stepsInit,
      md_engine,
      openmm_parameters: buildOpenMMParameters({ ...req.body, rg_min, rg_max }),
      access_mode: ctx.accessMode,
      ...(user ? { user } : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { public_id: ctx.publicId }
        : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { client_ip_hash: ctx.client_ip_hash }
        : {})
    }

    const newJob: IBilboMDOpenFoldJob = new BilboMdOpenFoldJob(jobData)
    await newJob.save()
    logger.info(`${bilbomdMode} Job saved to MongoDB: ${newJob._id.toString()}`)

    await writeJobParams(newJob._id.toString())

    const jobDataForQueue = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob._id.toString(),
      md_engine
    }

    const BullId = await queueJob(jobDataForQueue)
    logger.info(`${bilbomdMode} Job assigned UUID: ${newJob.uuid}`)
    logger.info(`${bilbomdMode} Job assigned BullMQ ID: ${BullId}`)

    if (ctx.accessMode === 'anonymous') {
      const origin = req.get('origin')
      const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        origin ||
        `${req.protocol}://${req.get('host')}`

      const resultPath = `/results/${ctx.publicId}`
      const resultUrl = `${baseUrl}${resultPath}`

      res.status(200).json({
        message: `New BilboMD OF3 Job successfully created`,
        jobid: newJob._id.toString(),
        uuid: newJob.uuid,
        md_engine,
        publicId: ctx.publicId,
        resultUrl,
        resultPath
      })
    } else {
      res.status(200).json({
        message: `New BilboMD OF3 Job successfully created`,
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

    logger.error('handleBilboMDOpenFoldJob error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDOpenFoldJob }
