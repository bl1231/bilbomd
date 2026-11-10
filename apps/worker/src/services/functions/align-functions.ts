import path from 'node:path'
import fs from 'fs-extra'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { runProcess, ProcessError } from '../../helpers/runProcess.js'
import {
  parseEnsembleFile,
  resolveEnsemblePdbPath,
  ALIGNED_MAP
} from './assemble-ensemble-pdb-file.js'

// BioEmu2 writes every structure in an arbitrary orientation, so the members
// of an ensemble don't line up the way MD frames do (bilbomd#1200).
// scripts/align_ensemble.py finds the rigid domains from all the sampled
// structures and superposes the members on the largest one; ensemble PDBs in
// the results then use the superposed copies (see ALIGNED_MAP).

const ALIGN_DIR = 'align'
const ALIGN_REPORT = path.join(ALIGN_DIR, 'alignment.json')
// Needs numpy + python-igraph: the worker's base Python environment
const ALIGN_SCRIPT = 'scripts/align_ensemble.py'

interface AlignReport {
  method: 'rigid-domain' | 'all-residues'
  samples: number
  residues: number
  anchor_size: number
  domains: { id: number; size: number; residues: string[] }[]
  members: { in: string; out: string; anchor_rmsd: number }[]
}

// foxs/rg30/bioemu_rg30_0007.pdb -> align/rg30_bioemu_rg30_0007.pdb
const alignedPath = (jobDir: string, member: string): string =>
  path.join(
    jobDir,
    ALIGN_DIR,
    `${path.basename(path.dirname(member))}_${path.basename(member)}`
  )

// The best single-state model: every other member is superposed onto it
const findReferenceMember = async (
  jobDir: string,
  members: string[]
): Promise<string> => {
  try {
    const ensemble = parseEnsembleFile(
      await fs.readFile(
        path.join(jobDir, 'multifoxs', 'ensembles_size_1.txt'),
        'utf8'
      ),
      1
    )
    const pdb = ensemble.models[0]?.states[0]?.pdb
    const resolved = pdb ? resolveEnsemblePdbPath(pdb, jobDir) : undefined
    if (resolved && members.includes(resolved)) return resolved
  } catch {
    // no single-state ensemble: any member will do
  }
  return members[0]
}

const describeReport = (report: AlignReport): string => {
  if (report.method !== 'rigid-domain') {
    return (
      'No rigid domain was found in the sampled structures, so the members ' +
      'were superposed on all residues.'
    )
  }
  const n = report.domains.length
  return (
    `Members superposed on the largest rigid domain (${report.anchor_size} of ` +
    `${report.residues} residues; ${n} rigid ${n === 1 ? 'domain' : 'domains'} ` +
    `found in ${report.samples} sampled structures).`
  )
}

// Superposes the ensemble members (their polished copies where there are any)
// and returns a sentence for the step message. Not fatal: if it fails the
// ensembles are delivered as they are. Cancellation still propagates.
const alignEnsembleMembers = async (
  jobDir: string,
  members: string[],
  polished: Record<string, string>
): Promise<string> => {
  const alignDir = path.join(jobDir, ALIGN_DIR)
  try {
    await fs.emptyDir(alignDir)
    const reference = await findReferenceMember(jobDir, members)
    const requestFile = path.join(alignDir, 'request.json')
    const reportFile = path.join(jobDir, ALIGN_REPORT)
    await fs.writeJson(
      requestFile,
      {
        samples_dir: path.join(jobDir, 'foxs'),
        members: members.map((m) => ({
          in: polished[m] ?? m,
          out: alignedPath(jobDir, m)
        })),
        reference: polished[reference] ?? reference
      },
      { spaces: 2 }
    )

    await runProcess({
      label: 'Align ensemble',
      cmd: config.basePythonBin,
      args: [
        path.resolve(process.cwd(), ALIGN_SCRIPT),
        requestFile,
        reportFile
      ],
      cwd: alignDir,
      stdoutFile: path.join(alignDir, 'align.log'),
      stderrFile: path.join(alignDir, 'align_error.log'),
      timeoutMs: config.processTimeouts.helperScriptMs,
      onStdoutLine: (line) => logger.info(`[align][stdout] ${line}`),
      onStderrLine: (line) => logger.warn(`[align][stderr] ${line}`)
    })

    const report = (await fs.readJson(reportFile)) as AlignReport
    const map: Record<string, string> = {}
    for (const m of members) {
      const out = alignedPath(jobDir, m)
      if (await fs.pathExists(out)) map[m] = out
    }
    await fs.writeJson(path.join(jobDir, ALIGNED_MAP), map, { spaces: 2 })
    return describeReport(report)
  } catch (error) {
    if (error instanceof ProcessError && error.result.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Superposing the ensemble members failed: ${message}`)
    // Leave nothing half-done for the results step to pick up
    await fs.remove(path.join(jobDir, ALIGNED_MAP))
    return `The members could not be superposed: ${message}`
  }
}

export {
  alignEnsembleMembers,
  ALIGN_DIR,
  ALIGN_REPORT,
  // Exported for unit tests:
  alignedPath,
  findReferenceMember,
  describeReport
}
