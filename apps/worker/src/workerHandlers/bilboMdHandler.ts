import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { config } from '../config/config.js'
import { processBilboMDAlphaFoldJob } from '../services/pipelines/bilbomd-alphafold.js'
import { processBilboMDAutoJob } from '../services/pipelines/bilbomd-auto.js'
import { processBilboMDCRDJob } from '../services/pipelines/bilbomd-crd.js'
import { processBilboMDJobNersc } from '../services/pipelines/bilbomd-nersc.js'
import { processBilboMDPDBJob } from '../services/pipelines/bilbomd-pdb.js'
import { processBilboMDSANSJob } from '../services/pipelines/bilbomd-sans.js'
import { WorkerJob } from '../types/jobtypes.js'

type PipelineExecutor = (job: Job<WorkerJob>) => Promise<void>

const getPipelineExecutor = (
  type: string,
  runOnNERSC: boolean
): PipelineExecutor | null => {
  const pipelines: Record<string, PipelineExecutor> = {
    pdb: runOnNERSC ? processBilboMDJobNersc : processBilboMDPDBJob,
    crd_psf: runOnNERSC ? processBilboMDJobNersc : processBilboMDCRDJob,
    auto: runOnNERSC ? processBilboMDJobNersc : processBilboMDAutoJob,
    alphafold: runOnNERSC ? processBilboMDJobNersc : processBilboMDAlphaFoldJob,
    sans: runOnNERSC ? processBilboMDJobNersc : processBilboMDSANSJob
  }
  return pipelines[type] ?? null
}

export const bilboMdHandler = async (job: Job<WorkerJob>) => {
  logger.info(`bilboMdHandler: ${JSON.stringify(job.data)}`)
  try {
    const executor = getPipelineExecutor(job.data.type, config.runOnNERSC)
    if (!executor) {
      throw new Error(`Unknown job type: ${job.data.type}`)
    }

    logger.info(`Start BilboMD ${job.data.type} job: ${job.name}`)
    await executor(job)
    logger.info(`Finished job: ${job.name}`)
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
    throw error // Re-throw to mark job as failed in BullMQ
  }
}
