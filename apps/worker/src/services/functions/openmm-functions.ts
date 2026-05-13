import { config } from '../../config/config.js'
import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import {
  IBilboMDPDBJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob,
  IBilboMDSteps,
  IStepStatus
} from '@bilbomd/mongodb-schema'
import { CARBOHYDRATE_RESIDUES } from '@bilbomd/bilbomd-types'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'
import fs from 'fs-extra'
import YAML from 'yaml'
import { runPythonStep } from '../../helpers/runPythonStep.js'
import { convertInpToYaml } from '@bilbomd/md-utils'

type OmmCapableJob =
  | IBilboMDPDBJob
  | IBilboMDAutoJob
  | IBilboMDAlphaFoldJob
  | IBilboMDOpenFoldJob
  | IBilboMDSANSJob

const detectCarbohydratesInPdb = async (pdbPath: string): Promise<boolean> => {
  try {
    const text = await fs.readFile(pdbPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const resName = line.slice(17, 20).trim().toUpperCase()
        if (CARBOHYDRATE_RESIDUES.has(resName)) return true
      }
    }
    return false
  } catch {
    return false
  }
}

// Backbone-integrated residues in CHARMM36 but absent from AMBER19.
// SEP=phosphoserine, TPO=phosphothreonine, PTR=phosphotyrosine,
// CYM=deprotonated cysteine, CYSP=phosphocysteine
const CHARMM36_BACKBONE_RESIDUES = new Set(['SEP', 'TPO', 'PTR', 'CYM', 'CYSP'])

const detectCharmm36ResiduesInPdb = async (
  pdbPath: string
): Promise<Set<string>> => {
  const detected = new Set<string>()
  try {
    const text = await fs.readFile(pdbPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const resName = line.slice(17, 20).trim().toUpperCase()
        if (CHARMM36_BACKBONE_RESIDUES.has(resName)) detected.add(resName)
      }
    }
  } catch {
    // ignore
  }
  return detected
}

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

const buildOpenMMConfigForJob = async (
  DBjob: OmmCapableJob,
  workDir: string
): Promise<OpenMMConfig> => {
  const omm_params = DBjob.openmm_parameters || {}

  // pdb_file is optional on IBilboMDAlphaFoldJob until runAlphaFold has
  // promoted af-rank1.pdb. For AF jobs prepareOpenMMConfig is only invoked
  // after that step, so this should always be present at runtime.
  const pdbFile = DBjob.pdb_file
  if (!pdbFile) {
    throw new Error(
      `prepareOpenMMConfig called for job ${DBjob.uuid} (${DBjob.__t}) ` +
        `without a pdb_file set on the job document.`
    )
  }

  const pdbPath = path.join(workDir, pdbFile)
  const hasCarbohydrates = await detectCarbohydratesInPdb(pdbPath)
  const charmm36Residues = await detectCharmm36ResiduesInPdb(pdbPath)
  const hasCharmm36Residues = charmm36Residues.size > 0

  if (hasCarbohydrates) {
    logger.info(
      `Glycoprotein detected in ${pdbFile} — activating GLYCAM force field ` +
        `(amber14/GLYCAM_06j-1.xml). Unsupported cofactors (FAD, HEM, PCA, etc.) ` +
        `will be stripped before MD.`
    )
  }
  if (hasCharmm36Residues && !hasCarbohydrates) {
    logger.info(
      `Non-standard backbone residues detected in ${pdbFile} ` +
        `(${[...charmm36Residues].join(', ')}) — switching to CHARMM36 force field ` +
        `(charmm36_2024.xml + implicit/gbn2.xml).`
    )
  } else if (hasCharmm36Residues && hasCarbohydrates) {
    logger.warn(
      `Non-standard backbone residues detected in ${pdbFile} ` +
        `(${[...charmm36Residues].join(', ')}) alongside glycans — GLYCAM force field ` +
        `takes priority; CHARMM36 will NOT be used. CHARMM36 residue support in ` +
        `glycoprotein mode is not yet implemented.`
    )
  }

  const forcefield = hasCarbohydrates
    ? ['amber19-all.xml', 'amber14/GLYCAM_06j-1.xml', 'implicit/gbn2.xml']
    : hasCharmm36Residues
      ? ['charmm36_2024.xml', 'implicit/gbn2.xml']
      : ['amber19-all.xml', 'implicit/gbn2.xml']

  return {
    input: {
      dir: workDir,
      pdb_file: pdbFile,
      forcefield,
      has_carbohydrates: hasCarbohydrates,
      has_charmm36_residues: hasCharmm36Residues
    },
    output: {
      output_dir: path.join(workDir, 'openmm'),
      min_dir: 'minimize',
      heat_dir: 'heat',
      md_dir: 'md'
    },
    steps: {
      minimization: {
        parameters: {
          max_iterations: omm_params.minimize?.max_iterations ?? 1000
        },
        output_pdb: 'minimized.pdb'
      },
      heating: {
        parameters: {
          start_temp: omm_params.heating?.start_temp ?? 300,
          final_temp: omm_params.heating?.final_temp ?? 600,
          nsteps: omm_params.heating?.nsteps ?? 10000,
          timestep: omm_params.heating?.timestep ?? 0.001
        },
        output_pdb: 'heated.pdb',
        output_restart: 'heated.xml'
      },
      md: {
        parameters: {
          temperature: omm_params.md?.temperature ?? 600,
          friction: omm_params.md?.friction ?? 0.1,
          nsteps: omm_params.md?.nsteps ?? 300000,
          timestep: omm_params.md?.timestep ?? 0.001
        },
        rgyr: {
          rgs: Array.isArray(omm_params.md?.rgyr?.[0])
            ? (omm_params.md?.rgyr?.[0] ?? [])
            : (omm_params.md?.rgyr ?? []),
          k_rg: omm_params.md?.k_rg ?? 10,
          report_interval: omm_params.md?.rg_report_interval ?? 500,
          filename: 'rgyr_dmax.csv'
        },
        output_pdb: 'md.pdb',
        output_restart: 'md.xml',
        output_dcd: 'md.dcd',
        pdb_report_interval: omm_params.md?.pdb_report_interval ?? 500
      }
    }
  }
}

const prepareOpenMMConfig = async (DBjob: OmmCapableJob): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const cfg = await buildOpenMMConfigForJob(DBjob, workDir)

  // Load constraints from openmm_const.yml if it exists (auto pipeline)
  const constYamlPath = path.join(workDir, 'openmm_const.yml')
  if (await fs.pathExists(constYamlPath)) {
    try {
      const constYamlRaw = await fs.readFile(constYamlPath, 'utf8')
      const constCfg = YAML.parse(constYamlRaw)

      // Handle both wrapped and unwrapped constraint formats
      if (constCfg?.constraints) {
        // New wrapped format: { constraints: { fixed_bodies: [...], rigid_bodies: [...] } }
        cfg.constraints = constCfg.constraints
        logger.info('Loaded constraints from wrapped format')
      } else if (constCfg?.fixed_bodies || constCfg?.rigid_bodies) {
        // Current flat format: { fixed_bodies: [...], rigid_bodies: [...] }
        cfg.constraints = {
          ...(constCfg.fixed_bodies && { fixed_bodies: constCfg.fixed_bodies }),
          ...(constCfg.rigid_bodies && { rigid_bodies: constCfg.rigid_bodies })
        }
        logger.info('Loaded constraints from flat format')
      }
    } catch (error) {
      logger.warn(`Error loading constraints from ${constYamlPath}: ${error}`)
    }
  } else if (DBjob.const_inp_file) {
    // Classic pipeline: convert user-uploaded CHARMM const.inp to OpenMM constraints
    const constInpPath = path.join(workDir, DBjob.const_inp_file)
    if (await fs.pathExists(constInpPath)) {
      try {
        const yamlContent = await convertInpToYaml(constInpPath, logger)
        const constCfg = YAML.parse(yamlContent)
        if (constCfg?.constraints) {
          cfg.constraints = constCfg.constraints
          logger.info('Loaded constraints from CHARMM const.inp for OpenMM')
        }
      } catch (error) {
        logger.warn(
          `Failed to convert const.inp to OpenMM constraints: ${error}`
        )
      }
    }
  }

  // Ensure constraints key always exists — heat.py and md.py require it
  if (!cfg.constraints) {
    cfg.constraints = { fixed_bodies: [], rigid_bodies: [] }
  }

  const yamlPath = await writeOpenMMConfigYaml(workDir, cfg)
  logger.info(`OpenMM config YAML written: ${yamlPath}`)

  DBjob.openmm_forcefield = cfg.input.forcefield
  await DBjob.save()
}

type OmmStepKey = 'minimize' | 'heat' | 'md'

interface OpenMMConfig {
  input: {
    dir: string
    pdb_file: string
    forcefield: string[]
    has_carbohydrates?: boolean
    has_charmm36_residues?: boolean
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
        start_temp: number
        final_temp: number
        nsteps: number
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
  DBjob: OmmCapableJob,
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

    let ommErrorDetail: string | null = null
    let lastStderrError: string | null = null
    const result = await runPythonStep(scriptPath, configYamlPath, {
      cwd: opts?.cwd,
      pythonBin: opts?.pythonBin ?? config.openmmPythonBin,
      env,
      timeoutMs: opts?.timeoutMs ?? 60 * 60 * 1000,
      onStdoutLine: (line) => {
        if (line.startsWith('BILBOMD_OPENMM_ERROR:')) {
          ommErrorDetail = line.slice('BILBOMD_OPENMM_ERROR:'.length).trim()
        }
        logger.info(`[${stepKey}][stdout] ${line}`)
      },
      onStderrLine: (line) => {
        logger.error(`[${stepKey}][stderr] ${line}`)
        if (line.startsWith('ERROR: ')) {
          lastStderrError = line.slice('ERROR: '.length).trim()
        }
      }
    })

    if (result.code !== 0) {
      let detail = ''
      if (ommErrorDetail) {
        try {
          const info = JSON.parse(ommErrorDetail) as {
            residue_name: string
            residue_index: number
          }
          detail = ` Template match failed for residue: ${info.residue_name} (index ${info.residue_index})`
        } catch {
          // ignore malformed JSON
        }
      }
      throw new Error(
        lastStderrError ??
          `${stepName} failed (exit ${result.code}${
            result.signal ? `, signal ${result.signal}` : ''
          })${detail}`
      )
    }

    status = {
      status: 'Success',
      message: `${stepName} has completed.`
    }
    await updateStepStatus(DBjob, stepKey, status)
  } catch (error: unknown) {
    logger.error(`Error during ${stepName} for job ${DBjob.uuid}: ${error}`)
    await handleError(error, DBjob, stepKey as keyof IBilboMDSteps)
  }
}

const runOmmMinimize = async (
  MQjob: BullMQJob,
  DBjob: OmmCapableJob,
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
  DBjob: OmmCapableJob,
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
  DBjob: OmmCapableJob,
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

  // Determine available GPUs
  const envCUDA = process.env.CUDA_VISIBLE_DEVICES
  let availableGpus: number[] = []

  if (envCUDA) {
    availableGpus = envCUDA
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id))
  } else {
    // Fallback: assume GPU 0 is available
    availableGpus = [0]
  }

  // Allow multiple processes per GPU (CUDA shares the device across contexts).
  // Cap at rgs.length — no point queuing more workers than tasks.
  const requestedConcurrency = opts?.concurrency ?? config.openmmMdConcurrency
  const maxParallel = Math.min(requestedConcurrency, rgs.length)

  logger.info(
    `[runOmmMD] Available GPUs: ${availableGpus.join(', ')}, ` +
      `requested concurrency: ${requestedConcurrency}, max parallel: ${maxParallel}`
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

  const runOne = async (rg: number, assignedGpu: number): Promise<void> => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/openmm/md.py')
    const env = {
      ...(opts?.platform ? { OPENMM_PLATFORM: opts.platform } : {}),
      ...(opts?.pluginDir ? { OPENMM_PLUGIN_DIR: opts.pluginDir } : {}),
      OMM_RG: String(rg),
      OMM_GPU_ID: String(assignedGpu)
      // Remove CUDA_VISIBLE_DEVICES - let OpenMM handle GPU selection
    }

    logger.info(`[md] launching rg=${rg} on GPU ${assignedGpu}`)

    const result = await runPythonStep(scriptPath, configYamlPath, {
      cwd: opts?.cwd,
      pythonBin: opts?.pythonBin ?? config.openmmPythonBin,
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
  let gpuCounter = 0 // Counter for proper GPU load balancing

  const processRg = async (rg: number) => {
    await semaphore.acquire()
    try {
      // Assign GPU when task actually starts, not when queued
      const assignedGpu = availableGpus[gpuCounter % availableGpus.length]
      gpuCounter++

      await runOne(rg, assignedGpu)
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
  await Promise.allSettled(rgs.map((rg) => processRg(rg)))

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
