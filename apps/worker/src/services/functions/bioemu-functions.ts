import { Job as BullMQJob } from 'bullmq'
import path from 'node:path'
import fs from 'fs-extra'
import axios from 'axios'
import { IBilboMDBioEmuJob, IStepStatus } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'
import { currentAbortSignal } from '../../helpers/jobCancellation.js'

// Files shared with bioemu2-service (apps/bioemu2-service/src/sampler.py)
const BIOEMU_DIR = 'bioemu'
const BIOEMU_SYSTEM_YAML = path.join(BIOEMU_DIR, 'system.yaml')
const BIOEMU_PARAMS_JSON = path.join(BIOEMU_DIR, 'params.json')
const BIOEMU_PROGRESS_JSON = path.join(BIOEMU_DIR, 'progress.json')
const BIOEMU_SUMMARY_JSON = path.join(BIOEMU_DIR, 'summary.json')

const HEARTBEAT_MS = 20_000
const CANCEL_TIMEOUT_MS = 10_000

interface BioEmuTargetSummary {
  rg_target: number
  frames: number
  physical: number
  rg_mean: number
  rg_sd: number
  seconds: number
}

interface BioEmuSummary {
  total_frames: number
  total_physical: number
  seconds: number
  targets: Record<string, BioEmuTargetSummary>
}

interface BioEmuProgress {
  done: number
  total: number
}

// The service reads the sampling settings from params.json, written fresh for
// every run so a resubmitted job uses what is stored on it now.
const writeBioEmuParams = async (
  workDir: string,
  DBjob: IBilboMDBioEmuJob
): Promise<void> => {
  const p = DBjob.bioemu_parameters
  if (!p?.rgs?.length) {
    throw new Error('BioEmu2 job has no Rg targets (bioemu_parameters.rgs)')
  }
  await fs.ensureDir(path.join(workDir, BIOEMU_DIR))
  await fs.writeJson(
    path.join(workDir, BIOEMU_PARAMS_JSON),
    {
      rgs: p.rgs,
      num_samples_per_rg: p.num_samples_per_rg,
      batch_size: p.batch_size,
      num_steps: p.num_steps,
      num_gd_steps: p.num_gd_steps,
      rg_weight: p.rg_weight,
      default_potentials: p.default_potentials,
      seed: 0
    },
    { spaces: 2 }
  )
}

const readProgress = async (
  workDir: string
): Promise<BioEmuProgress | null> => {
  try {
    return (await fs.readJson(
      path.join(workDir, BIOEMU_PROGRESS_JSON)
    )) as BioEmuProgress
  } catch {
    return null
  }
}

// Old samples would mix with the new ones in foxs/ on a rerun
const clearPreviousOutputs = async (workDir: string): Promise<void> => {
  await fs.remove(path.join(workDir, BIOEMU_PROGRESS_JSON))
  await fs.remove(path.join(workDir, BIOEMU_SUMMARY_JSON))
  const foxsDir = path.join(workDir, 'foxs')
  if (await fs.pathExists(foxsDir)) {
    for (const name of await fs.readdir(foxsDir)) {
      if (/^rg[\d.]+$/.test(name)) await fs.remove(path.join(foxsDir, name))
    }
  }
}

// Aborting the HTTP request alone would leave the service sampling on the GPU,
// so a cancelled job also tells the service to stop (at its next Rg target).
const requestServiceCancel = async (uuid: string): Promise<void> => {
  try {
    await axios.post(
      `${config.bioemuServiceUrl}/cancel`,
      { uuid },
      {
        headers: { 'content-type': 'application/json' },
        timeout: CANCEL_TIMEOUT_MS
      }
    )
    logger.info(`Asked the BioEmu2 service to cancel ${uuid}`)
  } catch (error) {
    logger.warn(`Could not cancel BioEmu2 sampling for ${uuid}: ${error}`)
  }
}

const callBioEmuService = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDBioEmuJob,
  workDir: string
): Promise<BioEmuSummary> => {
  const url = `${config.bioemuServiceUrl}/infer`
  logger.info(`Calling BioEmu2 service: POST ${url} uuid=${DBjob.uuid}`)
  await MQjob.log(`bioemu http: POST ${url}`)

  let lastDone = -1
  const heartbeat = setInterval(() => {
    void (async () => {
      await MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
      const progress = await readProgress(workDir)
      if (progress && progress.done !== lastDone) {
        lastDone = progress.done
        await updateStepStatus(DBjob, 'bioemu', {
          status: 'Running',
          message: `BioEmu2: ${progress.done}/${progress.total} Rg targets sampled.`
        })
      }
    })().catch((error) => logger.warn(`BioEmu2 heartbeat failed: ${error}`))
  }, HEARTBEAT_MS)

  const signal = currentAbortSignal()
  const onAbort = () => void requestServiceCancel(DBjob.uuid)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await axios.post(
      url,
      { uuid: DBjob.uuid },
      {
        headers: { 'content-type': 'application/json' },
        // axios rather than fetch: undici's default 300 s headersTimeout is too short
        timeout: config.bioemuTimeoutMs,
        signal
      }
    )
    return response.data.summary as BioEmuSummary
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const detail = (error.response.data as { detail?: unknown })?.detail
      throw new Error(
        `BioEmu2 service returned HTTP ${error.response.status}: ${
          typeof detail === 'string'
            ? detail
            : JSON.stringify(error.response.data)
        }`
      )
    }
    throw error
  } finally {
    clearInterval(heartbeat)
    signal?.removeEventListener('abort', onAbort)
  }
}

const describeSummary = (summary: BioEmuSummary): string => {
  const minutes = Math.round(summary.seconds / 60)
  return (
    `BioEmu2 sampling has completed: ${summary.total_physical} of ` +
    `${summary.total_frames} structures passed the physicality check ` +
    `(${Object.keys(summary.targets).length} Rg targets, ${minutes} min).`
  )
}

const runBioEmu = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDBioEmuJob
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)

  let status: IStepStatus = {
    status: 'Running',
    message: 'BioEmu2 sampling has started.'
  }
  await updateStepStatus(DBjob, 'bioemu', status)

  try {
    if (!(await fs.pathExists(path.join(workDir, BIOEMU_SYSTEM_YAML)))) {
      throw new Error(
        `${BIOEMU_SYSTEM_YAML} missing — the backend should have written it at submission`
      )
    }
    await clearPreviousOutputs(workDir)
    await writeBioEmuParams(workDir, DBjob)
    const summary = await callBioEmuService(MQjob, DBjob, workDir)

    status = { status: 'Success', message: describeSummary(summary) }
    await updateStepStatus(DBjob, 'bioemu', status)
  } catch (error) {
    logger.error(`runBioEmu failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, DBjob, 'bioemu')
    throw error
  }
}

export {
  runBioEmu,
  // Exported for unit tests:
  writeBioEmuParams,
  clearPreviousOutputs,
  describeSummary,
  BIOEMU_SYSTEM_YAML,
  BIOEMU_PARAMS_JSON,
  BIOEMU_SUMMARY_JSON
}
