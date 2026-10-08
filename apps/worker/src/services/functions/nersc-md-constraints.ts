import path from 'path'
import fs from 'fs-extra'
import YAML from 'yaml'
import { IJob, IMDConstraints, IChainMolType } from '@bilbomd/mongodb-schema'
import {
  convertInpToYaml,
  extractConstraintsFromYaml,
  buildChainMolTypes,
  buildChainMolTypesFromInp
} from '@bilbomd/md-utils'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'

// On the beamline, runPaeToConstInp writes md_constraints and
// prepareOpenMMConfig writes openmm_forcefield while the pipeline runs. A
// NERSC job runs those steps inside its Slurm script on Perlmutter, where the
// worker can't see them, so the fields were never saved and the UI's MD
// constraint track stayed empty. Once copy-back-to-cfs.sh has copied the
// Slurm workdir into the upload dir, the files it left behind hold the same
// information: openmm_config.yaml (force field and merged constraints) for
// OpenMM, const.inp for CHARMM.

// The generators promote the predicted model to a fixed name
// (select_best_alphafold_model in gen-*-slurm-file.py)
const PREDICTED_PDB: Partial<Record<IJob['__t'], string>> = {
  BilboMdAlphaFold: 'af-rank1.pdb',
  BilboMdOpenFold: 'of3-rank1.pdb'
}

// Constraint file written by pae2const.py for Auto and AlphaFold jobs
const PAE_CONST_INP = 'const.inp'

const firstExisting = async (
  dir: string,
  names: (string | undefined)[]
): Promise<string | undefined> => {
  for (const name of names) {
    if (name && (await fs.pathExists(path.join(dir, name)))) return name
  }
  return undefined
}

// The PDB the Slurm job ran MD on, for the chain types of the constraint track
const findMdPdb = (job: IJob, workDir: string) =>
  firstExisting(workDir, [
    PREDICTED_PDB[job.__t],
    job.get('pdb_file') as string | undefined
  ])

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
  const configPath = path.join(workDir, 'openmm_config.yaml')
  if (!(await fs.pathExists(configPath))) {
    logger.warn(
      `NERSC job ${job.uuid}: no openmm_config.yaml in ${workDir}; ` +
        `openmm_forcefield and md_constraints not recorded`
    )
    return false
  }
  const cfg = YAML.parse(
    await fs.readFile(configPath, 'utf8')
  ) as OpenMMConfigFile | null

  let changed = false
  const forcefield = cfg?.input?.forcefield
  if (Array.isArray(forcefield) && forcefield.length > 0) {
    job.openmm_forcefield = forcefield
    changed = true
  }

  // Classic jobs already have md_constraints from the backend at submission
  if (!job.md_constraints && cfg?.constraints) {
    const pdb = await findMdPdb(job, workDir)
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
  const constInp = await firstExisting(workDir, [uploaded, PAE_CONST_INP])
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
  const pdb = await findMdPdb(job, workDir)
  const chainMolTypes = pdb
    ? await buildChainMolTypes(path.join(workDir, pdb))
    : await buildChainMolTypesFromInp(constInpPath)
  job.md_constraints = withChainMolTypes(constraints, chainMolTypes)

  // As runPaeToConstInp does on the beamline, so the generated const.inp is
  // included in the results
  if (!uploaded) job.set('const_inp_file', constInp)
  return true
}

// Record md_constraints and openmm_forcefield for a finished NERSC job from
// the files copied back to CFS. Never fails the job: the results are
// complete without them, the UI just has no constraint track to draw.
const storeNerscMdConstraints = async (job: IJob): Promise<void> => {
  const workDir = path.join(config.uploadDir, job.uuid)
  try {
    const changed =
      job.md_engine === 'OpenMM'
        ? await storeFromOpenMMConfig(job, workDir)
        : await storeFromConstInp(job, workDir)
    if (changed) {
      await job.save()
      logger.info(`NERSC job ${job.uuid}: recorded MD constraints from CFS`)
    }
  } catch (error) {
    logger.warn(
      `NERSC job ${job.uuid}: could not record MD constraints: ${error}`
    )
  }
}

export { storeNerscMdConstraints }
