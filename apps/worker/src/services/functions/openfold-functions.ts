import { Job as BullMQJob } from 'bullmq'
import path from 'node:path'
import fs from 'fs-extra'
import { IBilboMDOpenFoldJob, IStepStatus } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'

const OF3_QUERY_FILE = 'of3-query.json'
const OF3_OUTPUT_DIR = 'openfold'
const OF3_RUNNER_YML = 'of3-runner.yml'
const OF3_RANK1_PDB = 'of3-rank1.pdb'
const OF3_PAE_JSON = 'of3-pae.json'
const OF3_QUERY_NAME = 'openfold-query'

const writeRunnerYml = async (workDir: string): Promise<void> => {
  const content = `output_writer_settings:\n  structure_format: pdb\n`
  await fs.writeFile(path.join(workDir, OF3_RUNNER_YML), content)
}

const callOf3Service = async (
  MQjob: BullMQJob,
  uuid: string
): Promise<void> => {
  const url = `${config.of3ServiceUrl}/infer`
  logger.info(`Calling OF3 service: POST ${url} uuid=${uuid}`)
  await MQjob.log(`openfold http: POST ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uuid }),
    signal: AbortSignal.timeout(config.of3TimeoutMs)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `OF3 service returned HTTP ${res.status}: ${body}`
    )
  }
}

// Walk openfold/<query>/seed_*/ directories and collect all (pdb, aggregated-json) pairs.
const collectSamples = async (
  ofOutDir: string
): Promise<{ pdbPath: string; aggPath: string; score: number }[]> => {
  const results: { pdbPath: string; aggPath: string; score: number }[] = []

  if (!(await fs.pathExists(ofOutDir))) {
    throw new Error(`OpenFold3 output directory missing: ${ofOutDir}`)
  }

  const queryDirs = await fs.readdir(ofOutDir)
  for (const queryDir of queryDirs) {
    const queryPath = path.join(ofOutDir, queryDir)
    const stat = await fs.stat(queryPath)
    if (!stat.isDirectory()) continue

    const seedDirs = await fs.readdir(queryPath)
    for (const seedDir of seedDirs) {
      if (!seedDir.startsWith('seed_')) continue
      const seedPath = path.join(queryPath, seedDir)

      const entries = await fs.readdir(seedPath)
      const pdbFiles = entries.filter((f) => f.endsWith('_model.pdb'))
      const aggFiles = entries.filter((f) => f.endsWith('_confidences_aggregated.json'))

      for (const pdbFile of pdbFiles) {
        // Find matching aggregated confidence file (same sample prefix)
        const samplePrefix = pdbFile.replace('_model.pdb', '')
        const aggFile = aggFiles.find((f) => f.startsWith(samplePrefix))
        if (!aggFile) {
          logger.warn(`No aggregated confidence file found for ${pdbFile}, skipping`)
          continue
        }

        const aggPath = path.join(seedPath, aggFile)
        let score = 0
        try {
          const aggData = await fs.readJson(aggPath)
          score = aggData.sample_ranking_score ?? 0
        } catch {
          logger.warn(`Failed to read ${aggFile}, using score 0`)
        }

        results.push({
          pdbPath: path.join(seedPath, pdbFile),
          aggPath,
          score
        })
      }
    }
  }

  if (results.length === 0) {
    throw new Error(`No valid OpenFold3 output samples found in ${ofOutDir}`)
  }

  return results
}

// Find the per-sample confidences.json (not aggregated) for PAE extraction.
const findConfidencesJson = async (pdbPath: string): Promise<string> => {
  const dir = path.dirname(pdbPath)
  const base = path.basename(pdbPath, '_model.pdb')
  const confFile = `${base}_confidences.json`
  const confPath = path.join(dir, confFile)
  if (!(await fs.pathExists(confPath))) {
    throw new Error(`Confidences JSON not found: ${confPath}`)
  }
  return confPath
}

const promoteRank1Outputs = async (workDir: string): Promise<void> => {
  const ofOutDir = path.join(workDir, OF3_OUTPUT_DIR)
  const samples = await collectSamples(ofOutDir)

  // Select the sample with the highest ranking score.
  const best = samples.reduce((prev, curr) =>
    curr.score > prev.score ? curr : prev
  )

  logger.info(
    `OF3 best sample: ${path.basename(best.pdbPath)} (score=${best.score.toFixed(4)})`
  )

  const pdbDst = path.join(workDir, OF3_RANK1_PDB)
  await fs.copy(best.pdbPath, pdbDst, { overwrite: true })

  const confSrc = await findConfidencesJson(best.pdbPath)
  const paeDst = path.join(workDir, OF3_PAE_JSON)
  await fs.copy(confSrc, paeDst, { overwrite: true })

  const [pdbStat, paeStat] = await Promise.all([
    fs.stat(pdbDst),
    fs.stat(paeDst)
  ])
  if (pdbStat.size === 0) throw new Error(`${OF3_RANK1_PDB} copied but is empty`)
  if (paeStat.size === 0) throw new Error(`${OF3_PAE_JSON} copied but is empty`)

  logger.info(`Promoted ${path.basename(best.pdbPath)} -> ${OF3_RANK1_PDB}`)
  logger.info(`Promoted ${path.basename(confSrc)} -> ${OF3_PAE_JSON}`)
}

const runOpenFold = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDOpenFoldJob
): Promise<void> => {
  const workDir = path.join(config.uploadDir, DBjob.uuid)

  let status: IStepStatus = {
    status: 'Running',
    message: 'OpenFold3 inference has started.'
  }
  await updateStepStatus(DBjob, 'openfold', status)

  try {
    const queryPath = path.join(workDir, OF3_QUERY_FILE)
    if (!(await fs.pathExists(queryPath))) {
      throw new Error(
        `OpenFold3 query JSON missing at ${queryPath} — backend should have created it at submission`
      )
    }

    await writeRunnerYml(workDir)
    await callOf3Service(MQjob, DBjob.uuid)
    await promoteRank1Outputs(workDir)

    DBjob.pdb_file = OF3_RANK1_PDB
    DBjob.pae_file = OF3_PAE_JSON
    await DBjob.save()

    status = {
      status: 'Success',
      message: 'OpenFold3 inference has completed.'
    }
    await updateStepStatus(DBjob, 'openfold', status)
  } catch (error) {
    logger.error(`runOpenFold failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, DBjob, 'openfold')
    throw error
  }
}

export {
  runOpenFold,
  // Exported for unit tests:
  promoteRank1Outputs,
  collectSamples,
  OF3_QUERY_NAME
}
