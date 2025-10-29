import path from 'path'
import { logger } from '../../middleware/loggers.js'
import {
  BilboMdAlphaFoldJob,
  IBilboMDAlphaFoldJob,
  IAlphaFoldEntity,
  IBilboMDSteps,
  StepStatus
} from '@bilbomd/mongodb-schema'
import { alphafoldJobSchema } from '../../validation/index.js'
import { ValidationError } from 'yup'
import { IUser } from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { writeJobParams, spawnAutoRgCalculator } from './index.js'
import { queueJob } from '../../queues/bilbomd.js'
import { createFastaFile } from './utils/createFastaFile.js'
import { parseAlphaFoldEntities } from './utils/parseAlphaFoldEntities.js'
import { buildOpenMMParameters } from './utils/openmmParams.js'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

type AutoRgResults = {
  rg: number
  rg_min: number
  rg_max: number
}

const handleBilboMDAlphaFoldJob = async (
  req: Request,
  res: Response,
  user: IUser,
  UUID: string
): Promise<void> => {
  if (process.env.USE_NERSC?.toLowerCase() !== 'true') {
    logger.warn('AlphaFold job rejected: NERSC not enabled')
    res.status(403).json({
      message: 'AlphaFold jobs unavailable on this deployment.'
    })
    return
  }
  const jobDir = path.join(uploadFolder, UUID)

  const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
  const md_engine: 'CHARMM' | 'OpenMM' =
    mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
  logger.info(`Selected md_engine: ${md_engine}`)

  const { bilbomd_mode: bilbomdMode } = req.body
  const files = req.files as { [fieldname: string]: Express.Multer.File[] }
  logger.info(`bilbomdMode: ${bilbomdMode}`)
  logger.info(`title: ${req.body.title}`)

  let parsedEntities: IAlphaFoldEntity[] = []

  try {
    parsedEntities = parseAlphaFoldEntities(req.body)
    logger.info(`Parsed ${parsedEntities.length} AlphaFold entities`)
  } catch (parseErr) {
    logger.error(
      'Failed to parse entities_json or reconstruct entities',
      parseErr
    )
    res
      .status(400)
      .json({ message: 'Invalid entities_json or malformed form data' })
    return
  }

  // Collect data for validation
  const datFile = files['dat_file']?.[0]
  logger.info(`datFile = ${datFile?.originalname}, path = ${datFile?.path}`)
  const jobPayload = {
    title: req.body.title,
    bilbomd_mode: req.body.bilbomd_mode,
    email: req.body.email,
    dat_file: datFile,
    entities: parsedEntities
  }

  // Validate
  try {
    await alphafoldJobSchema.validate(jobPayload, { abortEarly: false })
  } catch (validationErr) {
    if (validationErr instanceof ValidationError) {
      logger.warn('AlphaFold job payload validation failed', validationErr)
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

  // Create the FASTA file
  await createFastaFile(parsedEntities, jobDir)

  try {
    const datFileName =
      files['dat_file'] && files['dat_file'][0]
        ? files['dat_file'][0].originalname.toLowerCase()
        : 'missing.dat'

    // If the values calculated by autorg are outside of the limits set in the mongodb
    // schema then the job will not be created in mongodb and things fail in a way that
    // the user has no idea what has gone wrong.
    const { rg, rg_min, rg_max }: AutoRgResults = await spawnAutoRgCalculator(
      jobDir,
      datFileName
    )
    // Extract limits from schema
    const rgMinBound =
      BilboMdAlphaFoldJob.schema.path('rg_min')?.options.min ?? 10
    const rgMaxBound =
      BilboMdAlphaFoldJob.schema.path('rg_max')?.options.max ?? 100

    // Validate AutoRg values before creating job
    if (
      rg <= 0 ||
      rg_min < rgMinBound ||
      rg_max > rgMaxBound ||
      rg_min > rg ||
      rg > rg_max
    ) {
      logger.warn(
        `Invalid AutoRg values for job ${req.body.title || UUID}: ${JSON.stringify(
          {
            rg,
            rg_min,
            rg_max
          }
        )}`
      )
      res.status(400).json({
        message:
          'Rg values calculated from your SAXS data are outside allowed bounds',
        autorgResults: { rg, rg_min, rg_max },
        schemaLimits: {
          rg_min: rgMinBound,
          rg_max: rgMaxBound
        }
      })
      return
    }

    let stepsInit: IBilboMDSteps

    if (md_engine === 'OpenMM') {
      stepsInit = {
        alphafold: { status: StepStatus.Waiting, message: '' },
        pae: { status: StepStatus.Waiting, message: '' },
        autorg: { status: StepStatus.Waiting, message: '' },
        minimize: { status: StepStatus.Waiting, message: '' },
        initfoxs: { status: StepStatus.Waiting, message: '' },
        heat: { status: StepStatus.Waiting, message: '' },
        md: { status: StepStatus.Waiting, message: '' },
        foxs: { status: StepStatus.Waiting, message: '' },
        multifoxs: { status: StepStatus.Waiting, message: '' },
        results: { status: StepStatus.Waiting, message: '' },
        email: { status: StepStatus.Waiting, message: '' }
      }
    } else {
      stepsInit = {
        alphafold: { status: StepStatus.Waiting, message: '' },
        pdb2crd: { status: StepStatus.Waiting, message: '' },
        pae: { status: StepStatus.Waiting, message: '' },
        autorg: { status: StepStatus.Waiting, message: '' },
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
      }
    }

    const newJob: IBilboMDAlphaFoldJob = new BilboMdAlphaFoldJob({
      title: req.body.title,
      uuid: UUID,
      data_file: datFileName,
      rg,
      rg_min,
      rg_max,
      fasta_file: 'af-entities.fasta',
      alphafold_entities: parsedEntities,
      conformational_sampling: 3,
      status: 'Submitted',
      time_submitted: new Date(),
      user,
      steps: stepsInit,
      md_engine,
      ...(md_engine === 'OpenMM' && {
        openmm_parameters: buildOpenMMParameters(req.body)
      })
    })

    // Save the job to the database
    await newJob.save()
    logger.info(`${bilbomdMode} Job saved to MongoDB: ${newJob.id}`)

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

    res.status(200).json({
      message: `New BilboMD AF Job successfully created`,
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

    logger.error('handleBilboMDAlphaFoldJob error:', error)
    res.status(500).json({ message: msg })
  }
}

export { handleBilboMDAlphaFoldJob }
