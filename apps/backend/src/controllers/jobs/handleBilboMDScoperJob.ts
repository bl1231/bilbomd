import { logger } from '../../middleware/loggers.js'
import { queueScoperJob } from '../../queues/scoper.js'
import { BilboMdScoperJob, IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { DispatchUser } from '../../types/bilbomd.js'
import { hashClientIp } from '../../controllers/public/utils/hashClientIp.js'

const handleBilboMDScoperJob = async (
  req: Request,
  res: Response,
  user: DispatchUser | undefined,
  UUID: string,
  ctx: { accessMode: 'user' | 'anonymous'; publicId?: string }
) => {
  try {
    const { bilbomd_mode: bilbomdMode, title, fixc1c2 } = req.body

    // Hash the client IP address for privacy and for implementing a quota system
    const clientIp = req.ip ?? 'unknown'
    const client_ip_hash = hashClientIp(clientIp)

    // Extract md_engine and reject OpenMM early
    const mdEngineRaw = (req.body.md_engine ?? '').toString().toLowerCase()
    const md_engine: 'CHARMM' | 'OpenMM' =
      mdEngineRaw === 'openmm' ? 'OpenMM' : 'CHARMM'
    if (md_engine === 'OpenMM') {
      logger.warn(
        'handleBilboMDScoperJob: md_engine=OpenMM is not supported for this pipeline'
      )
      return res.status(422).json({
        message:
          'md_engine=OpenMM is not supported for this version of the BilboMD pipeline. Please use CHARMM.'
      })
    }
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    logger.info(
      `PDB File: ${
        files['pdb_file']
          ? files['pdb_file'][0].originalname.toLowerCase()
          : 'Not Found'
      }`
    )
    logger.info(
      `DAT File: ${
        files['dat_file']
          ? files['dat_file'][0].originalname.toLowerCase()
          : 'Not Found'
      }`
    )

    logger.info(`fixc1c2: ${fixc1c2}`)

    const jobData = {
      title,
      uuid: UUID,
      pdb_file: files['pdb_file'][0].originalname.toLowerCase(),
      data_file: files['dat_file'][0].originalname.toLowerCase(),
      fixc1c2,
      status: 'Submitted',
      time_submitted: new Date(),
      steps: {
        pdb2crd: {},
        pae: {},
        autorg: {},
        minimize: {},
        initfoxs: {},
        heat: {},
        md: {},
        dcd2pdb: {},
        foxs: {},
        multifoxs: {},
        results: {},
        email: {}
      },
      access_mode: ctx.accessMode,
      ...(user ? { user } : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { public_id: ctx.publicId }
        : {}),
      ...(ctx.accessMode === 'anonymous' && ctx.publicId
        ? { client_ip_hash }
        : {})
    }

    const newJob: IBilboMDScoperJob = new BilboMdScoperJob(jobData)

    // Save the job to the database
    await newJob.save()
    logger.info(`${bilbomdMode} Job saved to MongoDB: ${newJob.id}`)

    // Create BullMQ Job object
    const jobDataForQueue = {
      type: bilbomdMode,
      title: newJob.title,
      uuid: newJob.uuid,
      jobid: newJob.id
    }

    // Queue the job
    const BullId = await queueScoperJob(jobDataForQueue)

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
        message: `New Scoper Job successfully created`,
        jobid: newJob.id,
        uuid: newJob.uuid,
        md_engine,
        publicId: ctx.publicId,
        resultUrl,
        resultPath
      })
    } else {
      res.status(200).json({
        message: `New Scoper Job successfully created`,
        jobid: newJob.id,
        uuid: newJob.uuid,
        md_engine
      })
    }
  } catch (error) {
    // Log more detailed information about the error
    if (error instanceof Error) {
      logger.error(`Error in handleBilboMDScoperJob: ${error.message}`)
      logger.error(`Stack Trace: ${error.stack}`)
    } else {
      logger.error(`Non-standard error object: {error}`)
    }
    res
      .status(500)
      .json({ message: 'Failed to create handleBilboMDScoperJob job' })
  }
}

export { handleBilboMDScoperJob }
