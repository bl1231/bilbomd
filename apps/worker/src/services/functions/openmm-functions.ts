import { config } from '../../config/config.js'
import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import { IBilboMDPDBJob, IStepStatus } from '@bl1231/bilbomd-mongodb-schema'
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

// Parse a CHARMM-style const.inp to derive OpenMM constraints
// Supports lines like:
//   define fixed1 sele ( resid 214:672 .and. segid PROA ) end
//   cons fix sele fixed1 .or. fixed2 end
//   define rigid1 sele ( resid 1:188 .and. segid PROA ) end
//   shape desc dock1 rigid sele rigid1 end
// Mapping rule: SEGID like PROA -> chain_id "A" (last character)
const extractConstraintsFromConstInp = async (
  constInpPath: string
): Promise<OpenMMConfig['constraints'] | undefined> => {
  try {
    const raw = await fs.readFile(constInpPath, 'utf8')
    const lines = raw.split(/\r?\n/)

    // Collect name -> {start, stop, segid}
    const defines = new Map<string, { start: number; stop: number; segid: string }>()

    // Regexes (case-insensitive, tolerant of whitespace)
    const defineRe =
      /\bdefine\s+(\w+)\s+sele\s*\(\s*resid\s+(\d+)\s*:\s*(\d+)\s*\.and\.\s*segid\s+([A-Za-z0-9_]+)\s*\)\s*end/i
    const consFixStartRe = /\bcons\s+fix\s+sele\b/i
    const shapeRigidStartRe = /\bshape\s+desc\b.*\brigid\s+sele\b/i

    // First pass: capture all define blocks
    for (const line of lines) {
      const m = line.match(defineRe)
      if (m) {
        const [, name, s, e, segid] = m
        defines.set(name.toLowerCase(), {
          start: parseInt(s, 10),
          stop: parseInt(e, 10),
          segid
        })
      }
    }

    // Second pass: capture cons fix selection names ("name1 .or. name2 ... end")
    const fixedNames: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (consFixStartRe.test(line)) {
        // Gather tokens from this line until we hit 'end'
        let buf = line
        let j = i + 1
        while (!/\bend\b/i.test(buf) && j < lines.length) {
          buf += ' ' + lines[j]
          j++
        }
        // Extract names separated by ".or." or whitespace after 'sele'
        // Example: cons fix sele fixed1 .or. fixed2 end
        const afterSele = buf.split(/\bsele\b/i)[1] || ''
        const nameTokens = afterSele
          .replace(/\bend\b/i, '')
          .split(/\s*\.or\.\s*|\s+/i)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
        for (const token of nameTokens) {
          // keep only tokens that correspond to defines
          if (defines.has(token.toLowerCase())) fixedNames.push(token.toLowerCase())
        }
        i = j - 1
      }
    }

    // Third pass: capture rigid selections referenced by shape desc ... rigid sele <name1> [.or. <name2> ...] end
    const rigidNames: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (shapeRigidStartRe.test(line)) {
        // Gather tokens from this line until we hit 'end'
        let buf = line
        let j = i + 1
        while (!/\bend\b/i.test(buf) && j < lines.length) {
          buf += ' ' + lines[j]
          j++
        }
        // Extract names after 'rigid sele', possibly separated by '.or.'
        const afterSele = buf.split(/\brigid\s+sele\b/i)[1] || ''
        const nameTokens = afterSele
          .replace(/\bend\b/i, '')
          .split(/\s*\.or\.\s*|\s+/i)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
        for (const token of nameTokens) {
          if (defines.has(token.toLowerCase())) rigidNames.push(token.toLowerCase())
        }
        i = j - 1
      }
    }

    const fixed_bodies = fixedNames.map((nm, idx) => {
      const def = defines.get(nm)!
      const chain_id = def.segid.slice(-1) // PROA -> A
      return {
        name: `FixedBody${idx + 1}`,
        chain_id,
        residues: { start: def.start, stop: def.stop }
      }
    })

    const rigid_bodies = rigidNames.map((nm, idx) => {
      const def = defines.get(nm)!
      const chain_id = def.segid.slice(-1)
      return {
        name: `RigidBody${idx + 1}`,
        chain_id,
        residues: { start: def.start, stop: def.stop }
      }
    })

    if (fixed_bodies.length === 0 && rigid_bodies.length === 0) return undefined
    return { fixed_bodies, rigid_bodies }
  } catch (error) {
    // Missing file or parse error — be permissive and return undefined
    logger.warn(`Error extracting constraints from ${constInpPath}: ${error}`)
    return undefined
  }
}

const buildOpenMMConfigForJob = (
  DBjob: IBilboMDPDBJob,
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
        rgs: Array.from({ length: 6 }, (_, i) =>
          Math.round(DBjob.rg_min + (i * (DBjob.rg_max - DBjob.rg_min)) / 5)
        ),
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
const prepareOpenMMConfigYamlForJob = async (DBjob: IBilboMDPDBJob): Promise<string> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)
  const cfg = buildOpenMMConfigForJob(DBjob, workDir)
  const constInpPath = path.join(workDir, DBjob.const_inp_file)
  if (await fs.pathExists(constInpPath)) {
    const constraints = await extractConstraintsFromConstInp(constInpPath)
    if (constraints) cfg.constraints = constraints
  }
  const yamlPath = await writeOpenMMConfigYaml(workDir, cfg)
  logger.info(`OpenMM config YAML written: ${yamlPath}`)
  return yamlPath
}

type OmmStepKey = 'minimize' | 'heat' | 'md'

const runOmmStep = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob,
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
    await prepareOpenMMConfigYamlForJob(DBjob)
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
  DBjob: IBilboMDPDBJob,
  opts?: {
    cwd?: string
    platform?: 'CUDA' | 'OpenCL' | 'CPU'
    pluginDir?: string
    pythonBin?: string
    timeoutMs?: number
  }
): Promise<void> => {
  return runOmmStep(MQjob, DBjob, 'minimize', 'scripts/openmm/minimize.py', opts)
}

const runOmmHeat = (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob,
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
  DBjob: IBilboMDPDBJob,
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
    await prepareOpenMMConfigYamlForJob(DBjob)
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
  const gpuCount = envCUDA ? envCUDA.split(',').filter(Boolean).length : undefined
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
    throw new Error(`${stepName} completed with ${failed} failures out of ${rgs.length}`)
  }

  await updateStepStatus(DBjob, stepKey, {
    status: 'Success',
    message: `${stepName} has completed for ${rgs.length} Rg values`
  })
}

export { prepareOpenMMConfigYamlForJob, runOmmMinimize, runOmmHeat, runOmmMD }
