import fs from 'fs-extra'
import path from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  chainIdFromSegid,
  importConstraintsFromConstInp,
  inputFromStored,
  parseConstraintsJson,
  readCifSegments,
  readPdbSegments,
  readPsfSegments,
  toOpenMMConstraints,
  validateConstraintsInput,
  writeConstInp,
  type ChainMolType,
  type ConstraintError,
  type ConstraintMode,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import type { IMDConstraints } from '@bilbomd/mongodb-schema'
import { logger } from '../../../middleware/loggers.js'

/** Largest legacy constraint file read (const.inp or a stored YAML) */
const MAX_LEGACY_FILE_BYTES = 2_000_000

export type MaterializedConstraints =
  | {
      ok: true
      /** File written into the job dir: const.inp or openmm_const.yml */
      constFileName: string
      md_constraints: IMDConstraints
      warnings: string[]
    }
  | { ok: false; errors: ConstraintError[] }

interface MaterializeArgs {
  mode: ConstraintMode
  md_engine: 'CHARMM' | 'OpenMM'
  jobDir: string
  /** The uploaded structure: PDB or mmCIF (PDB mode) or PSF (CRD/PSF mode) */
  structureFile: string
  /** The `constraints` form field: JSON */
  constraintsField?: unknown
  /**
   * A constraint file instead of JSON: an uploaded const.inp (until uploads
   * are removed), or a file the server placed in the job dir (example data,
   * or the constraint file a resubmission reuses, which may be YAML)
   */
  legacyFile?: Express.Multer.File
}

const fail = (path: string, message: string): MaterializedConstraints => ({
  ok: false,
  errors: [{ path, message }]
})

const readStructure = async (file: string): Promise<StructureSegment[]> => {
  const text = await fs.readFile(file, 'utf8')
  const ext = path.extname(file).toLowerCase()
  if (ext === '.psf') return readPsfSegments(text)
  if (ext === '.cif') return readCifSegments(text)
  return readPdbSegments(text)
}

// pdb2crd-style segid prefix → molecule type, for CRD/PSF segments
const molTypeOfSegid = (segid: string): ChainMolType | undefined => {
  const prefix = segid.slice(0, 3)
  if (prefix === 'PRO' || prefix === 'DNA' || prefix === 'RNA') return prefix
  if (prefix === 'CAR' || prefix === 'CAL') return 'CAR'
  return undefined
}

// A const.inp names segments by segid. For a PDB-mode job, find each one's
// chain in the uploaded structure: the segid BilboMD wrote for chain `a` is
// PROA, so spelling alone can't tell it from chain A. Only a segid the
// structure doesn't have (an old Inp Jiffy name such as PRLA) is read by
// its spelling.
const segidsToChains = (
  input: ConstraintsInput,
  segments: StructureSegment[]
): { input: ConstraintsInput } | { problems: string[] } => {
  const problems: string[] = []
  const toChains = (body: ConstraintsInput['fixed_bodies'][number]) => ({
    segments: body.segments.flatMap(({ segid, residues }) => {
      const chainId =
        segments.find((s) => s.segid === segid)?.chain_id ??
        chainIdFromSegid(segid ?? '')
      if (chainId === null) {
        problems.push(`Segment ${segid} is not in the structure`)
        return []
      }
      return [{ chain_id: chainId, ...(residues ? { residues } : {}) }]
    })
  })
  const converted: ConstraintsInput = {
    fixed_bodies: input.fixed_bodies.map(toChains),
    ...(input.rigid_bodies
      ? { rigid_bodies: input.rigid_bodies.map(toChains) }
      : {})
  }
  return problems.length > 0 ? { problems } : { input: converted }
}

// The constraints in a legacy file, as input to validate. The file is
// removed afterwards, so its text can never reach CHARMM.
const readLegacyFile = async (
  file: Express.Multer.File,
  mode: ConstraintMode,
  jobDir: string,
  segments: StructureSegment[]
): Promise<{ ok: true; value: unknown } | MaterializedConstraints> => {
  try {
    const stat = await fs.stat(file.path)
    if (stat.size > MAX_LEGACY_FILE_BYTES) {
      return fail('inp_file', 'The constraint file is larger than 2 MB')
    }
    const text = await fs.readFile(file.path, 'utf8')
    const name = file.originalname.toLowerCase()

    if (name.endsWith('.yml') || name.endsWith('.yaml')) {
      const parsed: unknown = parseYaml(text, { maxAliasCount: 0 })
      const body =
        typeof parsed === 'object' && parsed !== null && 'constraints' in parsed
          ? (parsed as { constraints: unknown }).constraints
          : parsed
      return { ok: true, value: inputFromStored(body, mode) }
    }

    // Read by segid, then (PDB mode) matched to the structure's chains
    const imported = importConstraintsFromConstInp(text, 'crd_psf')
    const asErrors = (problems: string[]): MaterializedConstraints => ({
      ok: false,
      errors: problems.map((message) => ({ path: 'inp_file', message }))
    })
    if (!imported.input || imported.problems.length > 0) {
      return asErrors(imported.problems)
    }
    if (mode === 'crd_psf') return { ok: true, value: imported.input }
    const resolved = segidsToChains(imported.input, segments)
    if ('problems' in resolved) return asErrors(resolved.problems)
    return { ok: true, value: resolved.input }
  } catch (error) {
    logger.warn(`Could not read constraint file ${file.originalname}`, error)
    return fail('inp_file', 'The constraint file could not be read')
  } finally {
    // Never leave user-supplied constraint text where CHARMM could stream it
    if (path.dirname(path.resolve(file.path)) === path.resolve(jobDir)) {
      await fs.remove(file.path)
    }
  }
}

/**
 * Validates a job's constraints against its uploaded structure and writes
 * the only constraint file the MD engine will read: const.inp for CHARMM,
 * openmm_const.yml for OpenMM. Returns what to store as md_constraints.
 *
 * Constraints come as JSON (the `constraints` field). Until const.inp uploads
 * are removed, a legacy const.inp is accepted instead: it is read into the
 * same structured form (commands other than defines, `cons fix` and `shape
 * desc` are rejected), validated the same way, deleted, and replaced by a
 * file written by BilboMD. User text never reaches CHARMM.
 */
export const materializeConstraints = async ({
  mode,
  md_engine,
  jobDir,
  structureFile,
  constraintsField,
  legacyFile
}: MaterializeArgs): Promise<MaterializedConstraints> => {
  const hasJson =
    constraintsField !== undefined && String(constraintsField).trim() !== ''
  if (hasJson && legacyFile) {
    if (path.dirname(path.resolve(legacyFile.path)) === path.resolve(jobDir)) {
      await fs.remove(legacyFile.path)
    }
    return fail(
      'constraints',
      'Send constraints either as JSON in "constraints" or as a file, not both'
    )
  }

  let segments: StructureSegment[]
  try {
    segments = await readStructure(structureFile)
  } catch (error) {
    if (
      legacyFile &&
      path.dirname(path.resolve(legacyFile.path)) === path.resolve(jobDir)
    ) {
      await fs.remove(legacyFile.path)
    }
    throw error
  }

  let raw: unknown
  if (hasJson) {
    const parsed = parseConstraintsJson(constraintsField)
    if (!parsed.ok) return { ok: false, errors: parsed.errors }
    raw = parsed.value
  } else if (legacyFile) {
    const legacy = await readLegacyFile(legacyFile, mode, jobDir, segments)
    if (!('value' in legacy)) return legacy
    raw = legacy.value
  } else {
    return fail(
      'constraints',
      'Constraints are required: send them as JSON in the "constraints" field'
    )
  }

  const result = validateConstraintsInput(raw, { mode, segments })
  if (!result.ok) return { ok: false, errors: result.errors }
  const { constraints, warnings } = result

  const constFileName =
    md_engine === 'OpenMM' ? 'openmm_const.yml' : 'const.inp'
  const content =
    md_engine === 'OpenMM'
      ? stringifyYaml(
          { constraints: toOpenMMConstraints(constraints) },
          { indent: 2, lineWidth: 0 }
        )
      : writeConstInp(constraints)
  await fs.writeFile(path.join(jobDir, constFileName), content)

  // One entry per viewer chain; CRD/PSF segments can share one (PROA and
  // DNAA are both chain A), and the first keeps it, as before
  const chainMolTypes: { chain_id: string; mol_type: ChainMolType }[] = []
  for (const s of segments) {
    const molType = s.mol_type ?? molTypeOfSegid(s.segid)
    if (molType && !chainMolTypes.some((c) => c.chain_id === s.chain_id)) {
      chainMolTypes.push({ chain_id: s.chain_id, mol_type: molType })
    }
  }

  return {
    ok: true,
    constFileName,
    md_constraints: { ...constraints, chain_mol_types: chainMolTypes },
    warnings
  }
}
