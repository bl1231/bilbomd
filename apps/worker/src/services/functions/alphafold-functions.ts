import { Job as BullMQJob } from 'bullmq'
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

const callColabFoldService = async (
  MQjob: BullMQJob,
  uuid: string
): Promise<void> => {
  const url = `${config.colabfoldServiceUrl}/infer`
  logger.info(`Calling ColabFold service: POST ${url} uuid=${uuid}`)
  await MQjob.log(`alphafold http: POST ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uuid }),
    signal: AbortSignal.timeout(config.colabfoldTimeoutMs)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `ColabFold service returned HTTP ${res.status}: ${body}`
    )
  }
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

    await callColabFoldService(MQjob, DBjob.uuid)
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
  promoteRank1Outputs,
  RANK1_PDB_PATTERN,
  RANK1_PAE_PATTERN
}
