import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import YAML from 'yaml'
import {
  IJob,
  IMDConstraints,
  IChainMolType,
  StepStatusEnum
} from '@bilbomd/mongodb-schema'
import {
  convertInpToYaml,
  extractConstraintsFromYaml,
  buildChainMolTypes,
  buildChainMolTypesFromInp
} from '@bilbomd/md-utils'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { downloadNerscWorkFile } from './nersc-api-functions.js'

// On the beamline, runPaeToConstInp writes md_constraints and
// prepareOpenMMConfig writes openmm_forcefield while the pipeline runs. A
// NERSC job runs those steps inside its Slurm script on Perlmutter, where the
// worker can't see them, so the fields were never saved and the UI's MD
// constraint track stayed empty. The files the Slurm job writes hold the same
// information: openmm_config.yaml (force field and merged constraints) for
// OpenMM, const.inp for CHARMM. The job monitor reads them from the Slurm
// work dir on PSCRATCH through the NERSC API as soon as status.txt says they
// are complete, and again from the upload dir once copy-back-to-cfs.sh has
// run, for jobs that finished before the mid-run read could happen.

// The generators promote the predicted model to a fixed name
// (select_best_alphafold_model in gen-*-slurm-file.py)
const PREDICTED_PDB: Partial<Record<IJob['__t'], string>> = {
  BilboMdAlphaFold: 'af-rank1.pdb',
  BilboMdOpenFold: 'of3-rank1.pdb'
}

// Constraint file written by pae2const.py for Auto and AlphaFold jobs
const PAE_CONST_INP = 'const.inp'
const OPENMM_CONFIG = 'openmm_config.yaml'

// Slurm steps in status.txt that write the constraint files. The DB job has
// no such steps, so the monitor passes the raw status.txt steps.
const OPENMM_READY_STEP = 'consmerge'
const CHARMM_READY_STEP = 'pae2constraints'

const isOpenMM = (job: IJob) => job.md_engine === 'OpenMM'

// Candidates for the PDB the Slurm job ran MD on, most specific first
const pdbCandidates = (job: IJob): string[] =>
  [PREDICTED_PDB[job.__t], job.get('pdb_file') as string | undefined].filter(
    (name): name is string => Boolean(name)
  )

// The constraint file of a CHARMM job: the uploaded one for classic jobs,
// otherwise the one pae2const.py writes
const constInpCandidates = (job: IJob): string[] => [
  ...((job.get('const_inp_file') as string | undefined)
    ? [job.get('const_inp_file') as string]
    : []),
  PAE_CONST_INP
]

const firstExisting = async (
  dir: string,
  names: string[]
): Promise<string | undefined> => {
  for (const name of names) {
    if (await fs.pathExists(path.join(dir, name))) return name
  }
  return undefined
}

const withChainMolTypes = (
  constraints: IMDConstraints,
  chainMolTypes: IChainMolType[] | undefined
): IMDConstraints => ({
  fixed_bodies: constraints.fixed_bodies ?? [],
  rigid_bodies: constraints.rigid_bodies ?? [],
  ...(chainMolTypes && { chain_mol_types: chainMolTypes })
})

interface OpenMMConfigFile {
  input?: { forcefield?: string[] }
  constraints?: IMDConstraints
}

// openmm_config.yaml is written by gen-openmm-slurm-file.py with the force
// field it selected, and the Slurm job merges the PAE constraints into it
const storeFromOpenMMConfig = async (
  job: IJob,
  workDir: string
): Promise<boolean> => {
  const configPath = path.join(workDir, OPENMM_CONFIG)
  if (!(await fs.pathExists(configPath))) {
    logger.warn(
      `NERSC job ${job.uuid}: no ${OPENMM_CONFIG} in ${workDir}; ` +
        `openmm_forcefield and md_constraints not recorded`
    )
    return false
  }
  const cfg = YAML.parse(
    await fs.readFile(configPath, 'utf8')
  ) as OpenMMConfigFile | null

  let changed = false
  const forcefield = cfg?.input?.forcefield
  if (
    !job.openmm_forcefield &&
    Array.isArray(forcefield) &&
    forcefield.length > 0
  ) {
    job.openmm_forcefield = forcefield
    changed = true
  }

  // Classic jobs already have md_constraints from the backend at submission
  if (!job.md_constraints && cfg?.constraints) {
    const pdb = await firstExisting(workDir, pdbCandidates(job))
    const chainMolTypes = pdb
      ? await buildChainMolTypes(path.join(workDir, pdb))
      : undefined
    job.md_constraints = withChainMolTypes(cfg.constraints, chainMolTypes)
    changed = true
  }
  return changed
}

// CHARMM jobs: the uploaded const.inp for classic jobs, or the one
// pae2const.py wrote for Auto and AlphaFold jobs
const storeFromConstInp = async (
  job: IJob,
  workDir: string
): Promise<boolean> => {
  if (job.md_constraints) return false

  const uploaded = job.get('const_inp_file') as string | undefined
  const constInp = await firstExisting(workDir, constInpCandidates(job))
  if (!constInp) {
    logger.warn(
      `NERSC job ${job.uuid}: no constraint file in ${workDir}; ` +
        `md_constraints not recorded`
    )
    return false
  }
  const constInpPath = path.join(workDir, constInp)

  const constraints = extractConstraintsFromYaml(
    await convertInpToYaml(constInpPath, logger)
  )
  // Prefer the PDB; a CRD-only job can still read types from const.inp segids
  const pdb = await firstExisting(workDir, pdbCandidates(job))
  const chainMolTypes = pdb
    ? await buildChainMolTypes(path.join(workDir, pdb))
    : await buildChainMolTypesFromInp(constInpPath)
  job.md_constraints = withChainMolTypes(constraints, chainMolTypes)

  // As runPaeToConstInp does on the beamline, so the generated const.inp is
  // included in the results
  if (!uploaded) job.set('const_inp_file', constInp)
  return true
}

const storeFromWorkDir = async (
  job: IJob,
  workDir: string,
  source: string
): Promise<void> => {
  const changed = isOpenMM(job)
    ? await storeFromOpenMMConfig(job, workDir)
    : await storeFromConstInp(job, workDir)
  if (changed) {
    await job.save()
    logger.info(`NERSC job ${job.uuid}: recorded MD constraints from ${source}`)
  }
}

// Record md_constraints and openmm_forcefield for a finished NERSC job from
// the files copied back to CFS. Never fails the job: the results are
// complete without them, the UI just has no constraint track to draw.
const storeNerscMdConstraints = async (job: IJob): Promise<void> => {
  try {
    await storeFromWorkDir(job, path.join(config.uploadDir, job.uuid), 'CFS')
  } catch (error) {
    logger.warn(
      `NERSC job ${job.uuid}: could not record MD constraints: ${error}`
    )
  }
}

// Whether the fields the files would fill are still missing
const needsMdConstraints = (job: IJob): boolean =>
  !job.md_constraints || (isOpenMM(job) && !job.openmm_forcefield)

// Whether the Slurm job has written its constraint file. Classic jobs have
// no PAE steps: their files exist from the moment the job is prepared. An
// empty status.txt says nothing about the job, so it is not taken as ready.
const constraintFilesReady = (
  job: IJob,
  statusSteps: Record<string, StepStatusEnum>
): boolean => {
  if (Object.keys(statusSteps).length === 0) return false
  const step = isOpenMM(job) ? OPENMM_READY_STEP : CHARMM_READY_STEP
  return !(step in statusSteps) || statusSteps[step] === 'Success'
}

// Download the files storeFromWorkDir reads into dir. The constraint file is
// required; the PDB only when a candidate exists, so the chain types are
// never silently left out.
const downloadConstraintFiles = async (
  job: IJob,
  dir: string
): Promise<boolean> => {
  const fetchFirst = async (names: string[]): Promise<string | undefined> => {
    for (const name of names) {
      try {
        const content = await downloadNerscWorkFile(job.uuid, name)
        await fs.outputFile(path.join(dir, name), content)
        return name
      } catch (error) {
        logger.debug(`NERSC job ${job.uuid}: ${name} not downloaded: ${error}`)
      }
    }
    return undefined
  }

  const constraintFile = await fetchFirst(
    isOpenMM(job) ? [OPENMM_CONFIG] : constInpCandidates(job)
  )
  if (!constraintFile) return false

  // OpenMM classic jobs only need the force field, not the PDB
  if (isOpenMM(job) && job.md_constraints) return true

  const pdbs = pdbCandidates(job)
  if (pdbs.length === 0) return true
  return Boolean(await fetchFirst(pdbs))
}

// Record md_constraints and openmm_forcefield for a running NERSC job from
// the Slurm work dir on PSCRATCH, so the UI shows the constraint track while
// MD runs as it does on the beamline. statusSteps are the raw steps of
// status.txt. A failed download is retried on the next poll and, failing
// that, the files are read from CFS when the job completes.
const storeNerscMdConstraintsMidRun = async (
  job: IJob,
  statusSteps: Record<string, StepStatusEnum>
): Promise<void> => {
  if (!needsMdConstraints(job) || !constraintFilesReady(job, statusSteps)) {
    return
  }
  let dir: string | undefined
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), `nersc-${job.uuid}-`))
    if (await downloadConstraintFiles(job, dir)) {
      await storeFromWorkDir(job, dir, 'PSCRATCH')
    } else {
      logger.warn(
        `NERSC job ${job.uuid}: constraint files not yet downloadable; will retry`
      )
    }
  } catch (error) {
    logger.warn(
      `NERSC job ${job.uuid}: could not record MD constraints mid-run: ${error}`
    )
  } finally {
    if (dir) await fs.remove(dir)
  }
}

export { storeNerscMdConstraints, storeNerscMdConstraintsMidRun }
