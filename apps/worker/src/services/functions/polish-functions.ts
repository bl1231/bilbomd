import path from 'node:path'
import fs from 'fs-extra'
import { IJob } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { runProcess, ProcessError } from '../../helpers/runProcess.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  parseEnsembleFile,
  resolveEnsemblePdbPath,
  POLISHED_MAP
} from './assemble-ensemble-pdb-file.js'

// Restrained OpenMM minimization of the final ensemble members (bilbomd#1200):
// BioEmu2 samples have the right shape but small clashes and stretched bonds.
// scripts/openmm/polish.py does the work; ensemble PDBs in the results then
// use the polished copies (see readPolishedMap in assemble-ensemble-pdb-file).

const POLISH_DIR = 'polish'
const POLISH_SCRIPT = 'scripts/openmm/polish.py'

interface PolishJob {
  in: string
  out: string
}

interface PolishResult extends PolishJob {
  ok: boolean
  error?: string
  heavy_rmsd?: number
  rg_before?: number
  rg_after?: number
  seconds?: number
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Members of the top-ranked MultiFoXS model of every ensemble size, each once
const findEnsembleMembers = async (jobDir: string): Promise<string[]> => {
  const multiFoxsDir = path.join(jobDir, 'multifoxs')
  const files = (await fs.readdir(multiFoxsDir)).filter((f) =>
    /^ensembles_size_\d+\.txt$/.test(f)
  )
  const members = new Set<string>()
  for (const file of files) {
    const size = parseInt(file.match(/\d+/)?.[0] ?? '0', 10)
    const ensemble = parseEnsembleFile(
      await fs.readFile(path.join(multiFoxsDir, file), 'utf8'),
      size
    )
    for (const state of ensemble.models[0]?.states ?? []) {
      if (state.pdb) members.add(resolveEnsemblePdbPath(state.pdb, jobDir))
    }
  }
  return [...members].sort()
}

// foxs/rg30/bioemu_rg30_0007.pdb -> polish/rg30_bioemu_rg30_0007.pdb
const polishedPath = (jobDir: string, member: string): string =>
  path.join(
    jobDir,
    POLISH_DIR,
    `${path.basename(path.dirname(member))}_${path.basename(member)}`
  )

const describeResults = (results: PolishResult[]): string => {
  const ok = results.filter((r) => r.ok)
  if (ok.length === 0) return 'No ensemble member could be polished.'
  const rmsd = median(ok.map((r) => r.heavy_rmsd ?? 0))
  const dRg = median(ok.map((r) => (r.rg_after ?? 0) - (r.rg_before ?? 0)))
  const failed = results.length - ok.length
  return (
    `Polished ${ok.length} of ${results.length} ensemble members ` +
    `(median heavy-atom RMSD ${rmsd.toFixed(2)} Å, Rg change ${dRg.toFixed(2)} Å)` +
    (failed ? `; ${failed} kept unpolished.` : '.')
  )
}

// Not fatal: if polishing fails, the job still delivers the unpolished
// ensembles, and the step shows the error. Cancellation still propagates.
const runPolish = async (DBjob: IJob): Promise<void> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const polishDir = path.join(jobDir, POLISH_DIR)
  await updateStepStatus(DBjob, 'polish', {
    status: 'Running',
    message: 'Polishing the ensemble members has started.'
  })

  try {
    const members = await findEnsembleMembers(jobDir)
    if (members.length === 0) {
      throw new Error('no ensemble members found in multifoxs/')
    }
    await fs.emptyDir(polishDir)
    const jobs: PolishJob[] = members.map((m) => ({
      in: m,
      out: polishedPath(jobDir, m)
    }))
    const jobsFile = path.join(polishDir, 'jobs.json')
    const resultsFile = path.join(polishDir, 'results.json')
    await fs.writeJson(jobsFile, jobs, { spaces: 2 })

    await runProcess({
      label: 'Polish',
      cmd: config.openmmPythonBin,
      args: [path.resolve(process.cwd(), POLISH_SCRIPT), jobsFile, resultsFile],
      cwd: path.resolve(process.cwd(), 'scripts/openmm'),
      stdoutFile: path.join(polishDir, 'polish.log'),
      stderrFile: path.join(polishDir, 'polish_error.log'),
      timeoutMs: config.processTimeouts.openmmSetupMs,
      onStdoutLine: (line) => logger.info(`[polish][stdout] ${line}`),
      onStderrLine: (line) => logger.warn(`[polish][stderr] ${line}`)
    })

    const results = (await fs.readJson(resultsFile)) as PolishResult[]
    const map: Record<string, string> = {}
    for (const r of results) if (r.ok) map[r.in] = r.out
    await fs.writeJson(path.join(jobDir, POLISHED_MAP), map, { spaces: 2 })

    await updateStepStatus(DBjob, 'polish', {
      status: Object.keys(map).length ? 'Success' : 'Error',
      message: describeResults(results)
    })
  } catch (error) {
    if (error instanceof ProcessError && error.result.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Polishing failed for job ${DBjob.uuid}: ${message}`)
    await updateStepStatus(DBjob, 'polish', {
      status: 'Error',
      message: `Polishing failed, so the ensembles are unpolished: ${message}`
    })
  }
}

export {
  runPolish,
  // Exported for unit tests:
  findEnsembleMembers,
  polishedPath,
  describeResults
}
