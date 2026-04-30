import { Job as BullMQJob } from 'bullmq'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'fs-extra'
import { IBilboMDAlphaFoldJob, IStepStatus } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'

const FASTA_FILE = 'af-entities.fasta'
const AF_OUTPUT_DIR = 'alphafold'
const AF_RANK1_PDB = 'af-rank1.pdb'
const AF_PAE_JSON = 'af-pae.json'

const RANK1_PDB_PATTERN = /_relaxed_rank_001_.*\.pdb$/
const RANK1_PAE_PATTERN = /_scores_rank_001_.*\.json$/

const findSingleMatch = async (
  dir: string,
  pattern: RegExp,
  label: string
): Promise<string> => {
  const entries = await fs.readdir(dir)
  const matches = entries.filter((name) => pattern.test(name))
  if (matches.length === 0) {
    throw new Error(
      `No ${label} found in ${dir} matching ${pattern} — ColabFold output may be incomplete`
    )
  }
  if (matches.length > 1) {
    logger.warn(
      `Multiple ${label} files found, selecting first: ${matches.join(', ')}`
    )
  }
  return path.join(dir, matches[0])
}

const buildDockerArgs = (params: {
  hostJobDir: string
  hostCacheDir: string
  gpus: string
  image: string
}): string[] => {
  return [
    'run',
    '--rm',
    '--gpus',
    params.gpus,
    '-v',
    `${params.hostJobDir}:/bilbomd/work`,
    '-v',
    `${params.hostCacheDir}:/cache`,
    '-e',
    'COLABFOLD_DATA_DIR=/cache',
    params.image,
    'colabfold_batch',
    '--num-models=3',
    '--amber',
    '--use-gpu-relax',
    '--num-recycle=4',
    FASTA_FILE,
    AF_OUTPUT_DIR
  ]
}

const spawnColabFold = async (
  MQjob: BullMQJob,
  workDir: string,
  args: string[]
): Promise<void> => {
  const stdoutLog = path.join(workDir, 'colabfold.log')
  const stderrLog = path.join(workDir, 'colabfold_error.log')
  const stdoutStream = fs.createWriteStream(stdoutLog)
  const stderrStream = fs.createWriteStream(stderrLog)

  logger.info(`Spawning ColabFold: ${config.dockerBin} ${args.join(' ')}`)
  await MQjob.log(`alphafold spawn: ${config.dockerBin} ${args.join(' ')}`)

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(config.dockerBin, args, { cwd: workDir })

    const timer = setTimeout(() => {
      logger.error(
        `ColabFold timed out after ${config.colabfoldTimeoutMs}ms; killing pid ${proc.pid}`
      )
      proc.kill('SIGKILL')
    }, config.colabfoldTimeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutStream.write(chunk)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString()
      stderrStream.write(msg)
      logger.warn(`[colabfold stderr] ${msg.trimEnd()}`)
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      Promise.all([
        new Promise((r) => stdoutStream.end(r)),
        new Promise((r) => stderrStream.end(r))
      ]).finally(() => reject(err))
    })

    proc.on('close', (code, signal) => {
      clearTimeout(timer)
      Promise.all([
        new Promise((r) => stdoutStream.end(r)),
        new Promise((r) => stderrStream.end(r))
      ]).then(() => {
        if (code === 0) {
          resolve()
        } else {
          reject(
            new Error(
              `colabfold_batch exited with code ${code}${signal ? ` (signal ${signal})` : ''}`
            )
          )
        }
      })
    })
  })
}

const promoteRank1Outputs = async (workDir: string): Promise<void> => {
  const afOutDir = path.join(workDir, AF_OUTPUT_DIR)
  if (!(await fs.pathExists(afOutDir))) {
    throw new Error(`ColabFold output directory missing: ${afOutDir}`)
  }

  const pdbSrc = await findSingleMatch(
    afOutDir,
    RANK1_PDB_PATTERN,
    'rank_001 relaxed PDB'
  )
  const paeSrc = await findSingleMatch(
    afOutDir,
    RANK1_PAE_PATTERN,
    'rank_001 PAE scores JSON'
  )

  const pdbDst = path.join(workDir, AF_RANK1_PDB)
  const paeDst = path.join(workDir, AF_PAE_JSON)
  await fs.copy(pdbSrc, pdbDst, { overwrite: true })
  await fs.copy(paeSrc, paeDst, { overwrite: true })

  // Sanity check: copies are non-empty.
  const [pdbStat, paeStat] = await Promise.all([
    fs.stat(pdbDst),
    fs.stat(paeDst)
  ])
  if (pdbStat.size === 0) {
    throw new Error(`${AF_RANK1_PDB} copied but is empty`)
  }
  if (paeStat.size === 0) {
    throw new Error(`${AF_PAE_JSON} copied but is empty`)
  }

  logger.info(
    `Promoted ${path.basename(pdbSrc)} -> ${AF_RANK1_PDB} and ${path.basename(paeSrc)} -> ${AF_PAE_JSON}`
  )
}

const runAlphaFold = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDAlphaFoldJob
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)

  let status: IStepStatus = {
    status: 'Running',
    message: 'AlphaFold (ColabFold) has started.'
  }
  await updateStepStatus(DBjob, 'alphafold', status)

  try {
    const fastaPath = path.join(workDir, FASTA_FILE)
    if (!(await fs.pathExists(fastaPath))) {
      throw new Error(
        `AlphaFold input FASTA missing at ${fastaPath} — backend should have created it at submission`
      )
    }

    // Determine which GPU the parent worker holds. The NVIDIA Container
    // Toolkit set CUDA_VISIBLE_DEVICES when the worker started.
    const cudaDevices = process.env.CUDA_VISIBLE_DEVICES?.trim()
    const gpus = cudaDevices ? `device=${cudaDevices}` : 'all'

    // Sibling containers spawned via the host docker daemon use host paths,
    // not in-container paths. Translate <uploadDir>/<uuid> to its host equivalent.
    const hostJobDir = path.join(config.hostUploadDir, DBjob.uuid)

    const args = buildDockerArgs({
      hostJobDir,
      hostCacheDir: config.hostColabfoldCache,
      gpus,
      image: config.colabfoldImage
    })

    await spawnColabFold(MQjob, workDir, args)
    await promoteRank1Outputs(workDir)

    DBjob.pdb_file = AF_RANK1_PDB
    DBjob.pae_file = AF_PAE_JSON
    await DBjob.save()

    status = {
      status: 'Success',
      message: 'AlphaFold (ColabFold) has completed.'
    }
    await updateStepStatus(DBjob, 'alphafold', status)
  } catch (error) {
    logger.error(`runAlphaFold failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, DBjob, 'alphafold')
    throw error
  }
}

export {
  runAlphaFold,
  // Exported for unit tests:
  buildDockerArgs,
  promoteRank1Outputs,
  RANK1_PDB_PATTERN,
  RANK1_PAE_PATTERN
}
