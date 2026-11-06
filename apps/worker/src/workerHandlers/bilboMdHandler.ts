import { Job } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { config, type ExecutionBackend } from '../config/config.js'
import { processBilboMDAlphaFoldJob } from '../services/pipelines/bilbomd-alphafold.js'
import { processBilboMDOpenFoldJob } from '../services/pipelines/bilbomd-openfold.js'
import { processBilboMDAutoJob } from '../services/pipelines/bilbomd-auto.js'
import { processBilboMDCRDJob } from '../services/pipelines/bilbomd-crd.js'
import { processBilboMDJobNersc } from '../services/pipelines/bilbomd-nersc.js'
import { processBilboMDJobK8s } from '../services/pipelines/bilbomd-k8s.js'
import { processBilboMDPDBJob } from '../services/pipelines/bilbomd-pdb.js'
import { processBilboMDSANSJob } from '../services/pipelines/bilbomd-sans.js'
import { WorkerJob } from '../types/jobtypes.js'
import { runCancellable } from '../helpers/jobCancellation.js'

type PipelineExecutor = (job: Job<WorkerJob>) => Promise<void>

const PIPELINE_TYPES = [
  'pdb',
  'crd_psf',
  'auto',
  'alphafold',
  'openfold',
  'sans'
]

export const getPipelineExecutor = (
  type: string,
  backend: ExecutionBackend
): PipelineExecutor | null => {
  // On Kubernetes every job type runs the local pipeline in its own pod
  if (backend === 'k8s') {
    return PIPELINE_TYPES.includes(type) ? processBilboMDJobK8s : null
  }
  const runOnNERSC = backend === 'nersc'
  const pipelines: Record<string, PipelineExecutor> = {
    pdb: runOnNERSC ? processBilboMDJobNersc : processBilboMDPDBJob,
    crd_psf: runOnNERSC ? processBilboMDJobNersc : processBilboMDCRDJob,
    auto: runOnNERSC ? processBilboMDJobNersc : processBilboMDAutoJob,
    alphafold: runOnNERSC ? processBilboMDJobNersc : processBilboMDAlphaFoldJob,
    openfold: processBilboMDOpenFoldJob,
    sans: runOnNERSC ? processBilboMDJobNersc : processBilboMDSANSJob
  }
  return pipelines[type] ?? null
}

export const bilboMdHandler = async (
  job: Job<WorkerJob>,
  _token?: string,
  signal?: AbortSignal
) => {
  logger.info(`bilboMdHandler: ${JSON.stringify(job.data)}`)
  try {
    const executor = getPipelineExecutor(job.data.type, config.executionBackend)
    if (!executor) {
      throw new Error(`Unknown job type: ${job.data.type}`)
    }

    logger.info(`Start BilboMD ${job.data.type} job: ${job.name}`)
    await runCancellable(
      (job.data as { jobid?: string }).jobid,
      () => executor(job),
      signal
    )
    logger.info(`Finished job: ${job.name}`)
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error}`)
    throw error // Re-throw to mark job as failed in BullMQ
  }
}
