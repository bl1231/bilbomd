import fs from 'fs-extra'
import path from 'path'
import { stringify as stringifyYaml } from 'yaml'
import {
  importConstraintsFromConstInp,
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
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import type { IMDConstraints } from '@bilbomd/mongodb-schema'
import { logger } from '../../../middleware/loggers.js'

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
   * The example data's own const.inp, which the server placed in the job dir.
   * Users never send constraint files; this is the only one read.
   */
  exampleConstInp?: Express.Multer.File
}

const fail = (path: string, message: string): MaterializedConstraints => ({
  ok: false,
  errors: [{ path, message }]
})

export const readStructure = async (
  file: string
): Promise<StructureSegment[]> => {
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

/**
 * The molecule type of each chain, for the job page's chain track. One entry
 * per viewer chain; CRD/PSF segments can share one (PROA and DNAA are both
 * chain A), and the first keeps it.
 */
export const chainMolTypesOf = (
  segments: StructureSegment[]
): { chain_id: string; mol_type: ChainMolType }[] => {
  const chainMolTypes: { chain_id: string; mol_type: ChainMolType }[] = []
  for (const s of segments) {
    const molType = s.mol_type ?? molTypeOfSegid(s.segid)
    if (molType && !chainMolTypes.some((c) => c.chain_id === s.chain_id)) {
      chainMolTypes.push({ chain_id: s.chain_id, mol_type: molType })
    }
  }
  return chainMolTypes
}

const removeFromJobDir = async (file: Express.Multer.File, jobDir: string) => {
  if (path.dirname(path.resolve(file.path)) === path.resolve(jobDir)) {
    await fs.remove(file.path)
  }
}

// The example data's constraints, as input to validate. The file is removed
// afterwards; BilboMD writes its own const.inp from the result.
const readExampleConstInp = async (
  file: Express.Multer.File,
  mode: ConstraintMode,
  jobDir: string,
  segments: StructureSegment[]
): Promise<{ ok: true; value: unknown } | MaterializedConstraints> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const imported = importConstraintsFromConstInp(text, mode, {
      structure: segments
    })
    if (!imported.input || imported.problems.length > 0) {
      logger.error(
        `Example constraints ${file.originalname} did not import: ${imported.problems.join('; ')}`
      )
      return fail('constraints', 'The example constraints could not be read')
    }
    return { ok: true, value: imported.input }
  } finally {
    await removeFromJobDir(file, jobDir)
  }
}

/**
 * Validates a job's constraints against its uploaded structure and writes
 * the only constraint file the MD engine will read: const.inp for CHARMM,
 * openmm_const.yml for OpenMM. Returns what to store as md_constraints.
 *
 * Constraints come as JSON (the `constraints` field). Users never send
 * CHARMM text: the only constraint file read is the example data's own
 * const.inp, which is converted the same way and replaced.
 */
export const materializeConstraints = async ({
  mode,
  md_engine,
  jobDir,
  structureFile,
  constraintsField,
  exampleConstInp
}: MaterializeArgs): Promise<MaterializedConstraints> => {
  const hasJson =
    constraintsField !== undefined && String(constraintsField).trim() !== ''
  // Constraints sent with example data replace the example's own
  const exampleFile = hasJson ? undefined : exampleConstInp
  if (hasJson && exampleConstInp) {
    await removeFromJobDir(exampleConstInp, jobDir)
  }

  let segments: StructureSegment[]
  try {
    segments = await readStructure(structureFile)
  } catch (error) {
    if (exampleFile) await removeFromJobDir(exampleFile, jobDir)
    throw error
  }

  let raw: unknown
  if (hasJson) {
    const parsed = parseConstraintsJson(constraintsField)
    if (!parsed.ok) return { ok: false, errors: parsed.errors }
    raw = parsed.value
  } else if (exampleFile) {
    const example = await readExampleConstInp(
      exampleFile,
      mode,
      jobDir,
      segments
    )
    if (!('value' in example)) return example
    raw = example.value
  } else {
    return fail(
      'constraints',
      'Constraints are required: send them as JSON in the "constraints" field'
    )
  }

  const result = validateConstraintsInput(raw, {
    mode,
    segments,
    engine: md_engine === 'OpenMM' ? 'openmm' : 'charmm'
  })
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

  return {
    ok: true,
    constFileName,
    md_constraints: {
      ...constraints,
      chain_mol_types: chainMolTypesOf(segments)
    },
    warnings
  }
}
