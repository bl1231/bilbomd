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
        max_iterations: 1000
      },
      output_pdb: 'minimized.pdb'
    },
    heating: {
      parameters: {
        first_temp: 300,
        final_temp: 600,
        total_steps: 10000,
        timestep: 0.001
      },
      output_pdb: 'heated.pdb',
      output_restart: 'heated.xml'
    },
    md: {
      parameters: {
        temperature: 600,
        friction: 0.1,
        nsteps: 10000,
        timestep: 0.001
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
        k_rg: 10,
        report_interval: 1000,
        filename: 'rgyr.csv'
      },
      output_pdb: 'md.pdb',
      output_restart: 'md.xml',
      output_dcd: 'md.dcd',
      pdb_report_interval: 100
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

  // Determine concurrency
  const envCUDA = process.env.CUDA_VISIBLE_DEVICES
  const gpuCount = envCUDA
    ? envCUDA.split(',').filter(Boolean).length
    : undefined
  const maxParallel = opts?.concurrency ?? gpuCount ?? 1

  // Light-weight concurrency limiter
  const queue = rgs.slice()
  let running = 0
  let completed = 0
  let failed = 0

  const status: IStepStatus = {
    status: 'Running',
    message: `${stepName} has started for ${rgs.length} Rg values (max ${maxParallel} concurrent)`
  }
  await updateStepStatus(DBjob, stepKey, status)

  const runOne = async (rg: number) => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/openmm/md.py')
    const env = {
      ...(opts?.platform ? { OPENMM_PLATFORM: opts.platform } : {}),
      ...(opts?.pluginDir ? { OPENMM_PLUGIN_DIR: opts.pluginDir } : {}),
      OMM_RG: String(rg)
    }
    logger.info(`[md] launching rg=${rg}`)
    const result = await runPythonStep(scriptPath, configYamlPath, {
      cwd: opts?.cwd,
      pythonBin: opts?.pythonBin,
      env,
      timeoutMs: opts?.timeoutMs ?? 2 * 60 * 60 * 1000, // 2h default per run
      onStdoutLine: (line) => logger.info(`[md rg=${rg}][stdout] ${line}`),
      onStderrLine: (line) => logger.error(`[md rg=${rg}][stderr] ${line}`)
    })
    if (result.code !== 0) {
      throw new Error(
        `md.py (rg=${rg}) failed (exit ${result.code}${
          result.signal ? `, signal ${result.signal}` : ''
        })`
      )
    }
  }

  const pump = async (): Promise<void> => {
    while (running < maxParallel && queue.length > 0) {
      const rg = queue.shift()
      if (rg === undefined) break
      running++
      runOne(rg)
        .then(async () => {
          completed++
          running--
          await updateStepStatus(DBjob, stepKey, {
            status: 'Running',
            message: `${stepName}: completed ${completed}/${rgs.length} (max ${maxParallel} concurrent)`
          })
          await pump()
        })
        .catch(async (err) => {
          failed++
          running--
          logger.error(`Error in md (rg=${rg}): ${err}`)
          await updateStepStatus(DBjob, stepKey, {
            status: 'Running',
            message: `${stepName}: ${completed}/${rgs.length} done, ${failed} failed`
          })
          await pump()
        })
    }
  }

  await pump()
  // Wait for all in-flight to finish
  while (running > 0) {
    await new Promise((r) => setTimeout(r, 250))
  }

  if (failed > 0) {
    throw new Error(
      `${stepName} completed with ${failed} failures out of ${rgs.length}`
    )
  }

  await updateStepStatus(DBjob, stepKey, {
    status: 'Success',
    message: `${stepName} has completed for ${rgs.length} Rg values`
  })
}

export { prepareOpenMMConfig, runOmmMinimize, runOmmHeat, runOmmMD }
