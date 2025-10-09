import { config } from '../../config/config.js'
import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import {
  IBilboMDPDBJob,
  IBilboMDAutoJob,
  IStepStatus
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import fs from 'fs-extra'
import YAML from 'yaml'
import { runPythonStep } from '../../helpers/runPythonStep.js'

const writeOpenMMConfigYaml = async (
  dir: string,
  cfg: OpenMMConfig | Record<string, unknown>,
  filename = 'openmm_config.yaml'
): Promise<string> => {
  const filePath = path.join(dir, filename)

  // Ensure the directory exists.
  await fs.mkdir(dir, { recursive: true })

  // Serialize with deterministic key order for diff-friendly output.
  // Avoids line wrapping to keep paths intact.
  const yamlText = YAML.stringify(cfg, {
    sortMapEntries: true,
    lineWidth: 0
  })

  // Write atomically: write to a temp file, then rename.
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, yamlText, 'utf8')
  await fs.rename(tmpPath, filePath)

  return filePath
}

const buildOpenMMConfigForJob = (
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob,
  workDir: string
): OpenMMConfig => ({
  input: {
    dir: workDir,
    pdb_file: DBjob.pdb_file,
    forcefield: ['charmm36.xml', 'implicit/hct.xml']
  },
  output: {
    output_dir: workDir,
    min_dir: 'minimize',
    heat_dir: 'heat',
    md_dir: 'md'
  },
  steps: {
    minimization: {
      parameters: {
        max_iterations: parseInt(process.env.OMM_MINIMIZE_MAX_ITER || '1000')
      },
      output_pdb: 'minimized.pdb'
    },
    heating: {
      parameters: {
        first_temp: parseInt(process.env.OMM_HEAT_FIRST_TEMP || '300'),
        final_temp: parseInt(process.env.OMM_HEAT_FINAL_TEMP || '600'),
        total_steps: parseInt(process.env.OMM_HEAT_TOTAL_STEPS || '10000'),
        timestep: parseFloat(process.env.OMM_HEAT_TIMESTEP || '0.001')
      },
      output_pdb: 'heated.pdb',
      output_restart: 'heated.xml'
    },
    md: {
      parameters: {
        temperature: parseInt(process.env.OMM_MD_TEMP || '300'),
        friction: parseFloat(process.env.OMM_MD_FRICTION || '0.1'),
        nsteps: parseInt(process.env.OMM_MD_NSTEPS || '10000'),
        timestep: parseFloat(process.env.OMM_MD_TIMESTEP || '0.001')
      },
      rgyr: {
        rgs: (() => {
          if (
            typeof DBjob.rg_min !== 'number' ||
            typeof DBjob.rg_max !== 'number'
          ) {
            throw new Error('rg_min and rg_max must be defined numbers')
          }
          const rg_min = DBjob.rg_min
          const rg_max = DBjob.rg_max
          return Array.from({ length: 6 }, (_, i) =>
            Math.round(rg_min + (i * (rg_max - rg_min)) / 5)
          )
        })(),
        k_rg: parseInt(process.env.OMM_MD_K_RG || '10'),
        report_interval: parseInt(
          process.env.OMM_MD_RG_REPORT_INTERVAL || '100'
        ),
        filename: 'rgyr.csv'
      },
      output_pdb: 'md.pdb',
      output_restart: 'md.xml',
      output_dcd: 'md.dcd',
      pdb_report_interval: parseInt(
        process.env.OMM_MD_PDB_REPORT_INTERVAL || '100'
      )
    }
  }
})

// Prepare (build + write) a single YAML config for all downstream OpenMM steps.
// Returns the absolute path to the written config.
const prepareOpenMMConfig = async (
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob
): Promise<string> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const cfg = buildOpenMMConfigForJob(DBjob, workDir)

  // Load constraints from openmm_const.yml if it exists
  const constYamlPath = path.join(workDir, 'openmm_const.yml')
  if (await fs.pathExists(constYamlPath)) {
    try {
      const constYamlRaw = await fs.readFile(constYamlPath, 'utf8')
      const constCfg = YAML.parse(constYamlRaw)
      if (constCfg?.constraints) {
        cfg.constraints = constCfg.constraints
      }
    } catch (error) {
      logger.warn(`Error loading constraints from ${constYamlPath}: ${error}`)
    }
  }

  const yamlPath = await writeOpenMMConfigYaml(workDir, cfg)
  logger.info(`OpenMM config YAML written: ${yamlPath}`)
  return yamlPath
}

type OmmStepKey = 'minimize' | 'heat' | 'md'

interface OpenMMConfig {
  input: {
    dir: string
    pdb_file: string
    forcefield: string[]
  }
  output: {
    output_dir: string
    min_dir: string
    heat_dir: string
    md_dir: string
  }
  steps: {
    minimization: {
      parameters: { max_iterations: number }
      output_pdb: string
    }
    heating: {
      parameters: {
        first_temp: number
        final_temp: number
        total_steps: number
        timestep: number
      }
      output_pdb: string
      output_restart: string
    }
    md: {
      parameters: {
        temperature: number
        friction: number
        nsteps: number
        timestep: number
      }
      rgyr: {
        rgs: number[]
        k_rg: number
        report_interval: number
        filename: string
      }
      output_pdb: string
      output_restart: string
      output_dcd: string
      pdb_report_interval: number
    }
  }
  constraints?: Record<string, unknown>
}

const runOmmStep = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob,
  stepKey: OmmStepKey,
  scriptRelPath: string,
  opts?: {
    cwd?: string
    platform?: 'CUDA' | 'OpenCL' | 'CPU'
    pluginDir?: string
    pythonBin?: string
    timeoutMs?: number
  }
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const stepName = `OpenMM ${stepKey}`
  logger.info(`Starting ${stepName} for job ${DBjob.uuid}`)
  const configYamlPath = path.join(workDir, 'openmm_config.yaml')
  if (!(await fs.pathExists(configYamlPath))) {
    await prepareOpenMMConfig(DBjob)
  }

  try {
    let status: IStepStatus = {
      status: 'Running',
      message: `${stepName} has started.`
    }
    await updateStepStatus(DBjob, stepKey, status)

    const scriptPath = path.resolve(process.cwd(), scriptRelPath)
    const env = {
      ...(opts?.platform ? { OPENMM_PLATFORM: opts.platform } : {}),
      ...(opts?.pluginDir ? { OPENMM_PLUGIN_DIR: opts.pluginDir } : {})
    }

    const result = await runPythonStep(scriptPath, configYamlPath, {
      cwd: opts?.cwd,
      pythonBin: opts?.pythonBin,
      env,
      timeoutMs: opts?.timeoutMs ?? 60 * 60 * 1000,
      onStdoutLine: (line) => {
        logger.info(`[${stepKey}][stdout] ${line}`)
      },
      onStderrLine: (line) => {
        logger.error(`[${stepKey}][stderr] ${line}`)
      }
    })

    if (result.code !== 0) {
      throw new Error(
        `${stepName} failed (exit ${result.code}${
          result.signal ? `, signal ${result.signal}` : ''
        })`
      )
    }

    status = {
      status: 'Success',
      message: `${stepName} has completed.`
    }
    await updateStepStatus(DBjob, stepKey, status)
  } catch (error: unknown) {
    logger.error(`Error during ${stepName} for job ${DBjob.uuid}: ${error}`)
    // Optional: centralized error handler if desired
  }
}

const runOmmMinimize = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob,
  opts?: {
    cwd?: string
    platform?: 'CUDA' | 'OpenCL' | 'CPU'
    pluginDir?: string
    pythonBin?: string
    timeoutMs?: number
  }
): Promise<void> => {
  return runOmmStep(
    MQjob,
    DBjob,
    'minimize',
    'scripts/openmm/minimize.py',
    opts
  )
}

const runOmmHeat = (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob,
  opts?: {
    cwd?: string
    platform?: 'CUDA' | 'OpenCL' | 'CPU'
    pluginDir?: string
    pythonBin?: string
    timeoutMs?: number
  }
) => runOmmStep(MQjob, DBjob, 'heat', 'scripts/openmm/heat.py', opts)

const runOmmMD = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDAutoJob,
  opts?: {
    cwd?: string
    platform?: 'CUDA' | 'OpenCL' | 'CPU'
    pluginDir?: string
    pythonBin?: string
    timeoutMs?: number
    concurrency?: number // optional: cap parallel md.py processes
    failureThreshold?: number // percentage of failures to tolerate (0-1, default 0)
  }
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const stepKey: OmmStepKey = 'md'
  const stepName = 'OpenMM md'
  logger.info(`Starting ${stepName} (parallel) for job ${DBjob.uuid}`)

  const configYamlPath = path.join(workDir, 'openmm_config.yaml')
  if (!(await fs.pathExists(configYamlPath))) {
    await prepareOpenMMConfig(DBjob)
  }

  // Read YAML to get Rg list
  const yamlRaw = await fs.readFile(configYamlPath, 'utf8')
  const cfg = YAML.parse(yamlRaw)
  let rgs: number[] = cfg?.steps?.md?.rgyr?.rgs ?? []
  if (!Array.isArray(rgs) || rgs.length === 0) {
    logger.warn('No rgs found in config; defaulting to [50]')
    rgs = [50]
  }

  // Determine available GPUs and concurrency
  const envCUDA = process.env.CUDA_VISIBLE_DEVICES
  let availableGpus: number[] = []

  if (envCUDA) {
    // Parse CUDA_VISIBLE_DEVICES to get actual GPU IDs
    availableGpus = envCUDA
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id))
  } else {
    // Fallback: assume GPU 0 is available
    availableGpus = [0]
  }

  const maxParallel = Math.min(
    opts?.concurrency ?? availableGpus.length,
    availableGpus.length
  )

  logger.info(
    `[runOmmMD] Available GPUs: ${availableGpus.join(', ')}, max parallel: ${maxParallel}`
  )

  // Prepare job tracking
  const failureThreshold = opts?.failureThreshold ?? 0 // Default: no failures allowed
  const results: Array<{
    rg: number
    status: 'success' | 'error'
    error?: Error
  }> = []

  // Light-weight concurrency limiter
  const status: IStepStatus = {
    status: 'Running',
    message: `${stepName} has started for ${rgs.length} Rg values (max ${maxParallel} concurrent)`
  }
  await updateStepStatus(DBjob, stepKey, status)

  const runOne = async (rg: number, gpuIndex: number): Promise<void> => {
    const assignedGpu = availableGpus[gpuIndex % availableGpus.length]
    const scriptPath = path.resolve(process.cwd(), 'scripts/openmm/md.py')
    const env = {
      ...(opts?.platform ? { OPENMM_PLATFORM: opts.platform } : {}),
      ...(opts?.pluginDir ? { OPENMM_PLUGIN_DIR: opts.pluginDir } : {}),
      OMM_RG: String(rg),
      OMM_GPU_ID: String(assignedGpu),
      // Explicitly set CUDA device visibility for this process
      CUDA_VISIBLE_DEVICES: String(assignedGpu)
    }

    logger.info(`[md] launching rg=${rg} on GPU ${assignedGpu}`)

    const result = await runPythonStep(scriptPath, configYamlPath, {
      cwd: opts?.cwd,
      pythonBin: opts?.pythonBin,
      env,
      timeoutMs: opts?.timeoutMs ?? 2 * 60 * 60 * 1000, // 2h default per run
      onStdoutLine: (line) =>
        logger.info(`[md rg=${rg} GPU=${assignedGpu}][stdout] ${line}`),
      onStderrLine: (line) =>
        logger.error(`[md rg=${rg} GPU=${assignedGpu}][stderr] ${line}`)
    })

    if (result.code !== 0) {
      throw new Error(
        `md.py (rg=${rg}, GPU=${assignedGpu}) failed (exit ${result.code}${
          result.signal ? `, signal ${result.signal}` : ''
        })`
      )
    }

    logger.info(`[md] completed rg=${rg} on GPU ${assignedGpu}`)
  }

  // Use Promise.allSettled with manual concurrency control via semaphore pattern
  class Semaphore {
    private permits: number
    private waiting: Array<() => void> = []

    constructor(permits: number) {
      this.permits = permits
    }

    async acquire(): Promise<void> {
      if (this.permits > 0) {
        this.permits--
        return
      }

      return new Promise<void>((resolve) => {
        this.waiting.push(resolve)
      })
    }

    release(): void {
      if (this.waiting.length > 0) {
        const resolve = this.waiting.shift()!
        resolve()
      } else {
        this.permits++
      }
    }
  }

  const semaphore = new Semaphore(maxParallel)
  let completed = 0

  const processRg = async (rg: number, index: number) => {
    await semaphore.acquire()
    try {
      await runOne(rg, index)
      completed++
      results.push({ rg, status: 'success' })

      // Update progress
      await updateStepStatus(DBjob, stepKey, {
        status: 'Running',
        message: `${stepName}: completed ${completed}/${rgs.length}`
      })
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      results.push({ rg, status: 'error', error: errorObj })
      logger.error(`Error in md (rg=${rg}): ${errorObj.message}`)

      // Update progress with error count
      const failures = results.filter((r) => r.status === 'error').length
      await updateStepStatus(DBjob, stepKey, {
        status: 'Running',
        message: `${stepName}: ${completed}/${rgs.length} completed, ${failures} failed`
      })
    } finally {
      semaphore.release()
    }
  }

  // Launch all tasks
  await Promise.allSettled(rgs.map((rg, index) => processRg(rg, index)))

  // Analyze results
  const failures = results.filter((r) => r.status === 'error')
  const failureRate = failures.length / results.length

  if (failureRate > failureThreshold) {
    const errorSummary = failures
      .map((f) => `rg=${f.rg}: ${f.error?.message}`)
      .join('; ')
    throw new Error(
      `${stepName} failed: ${failures.length}/${results.length} failures (${Math.round(failureRate * 100)}% > ${Math.round(failureThreshold * 100)}% threshold). Errors: ${errorSummary}`
    )
  }

  if (failures.length > 0) {
    logger.warn(
      `${stepName} completed with ${failures.length} non-fatal failures (below threshold)`
    )
  }

  await updateStepStatus(DBjob, stepKey, {
    status: 'Success',
    message: `${stepName} has completed for ${rgs.length} Rg values (${failures.length} failures tolerated)`
  })
}

export { prepareOpenMMConfig, runOmmMinimize, runOmmHeat, runOmmMD }
