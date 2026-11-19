import { parse as parseYaml } from 'yaml'
import {
  importConstraintsFromConstInp,
  importConstraintsFromData,
  type ConstraintBodyInput,
  type ConstraintMode,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'

export interface ConstraintsFileImport {
  /** The constraints, or null when the file can't be used as it is */
  input: ConstraintsInput | null
  /** What was left out of the file; any of these blocks the job */
  problems: string[]
  /** Selections fitted to how BilboMD builds the structure; informational */
  notes: string[]
  /**
   * The bodies of a const.inp with several `cons fix` commands. CHARMM keeps
   * only the last, so the user picks one with `fixedBody`.
   */
  fixedChoices: ConstraintBodyInput[]
}

export const CONSTRAINTS_FILE_ACCEPT = '.inp,.yml,.yaml,.json'

// The const.inp importer adds this to its problems when fixedChoices are set
const CHOOSE_FIXED = 'Choose which is the fixed body'

/**
 * Reads a constraints file against the job's structure: a CHARMM const.inp,
 * an OpenMM constraints YAML (openmm_const.yml, openmm_config.yaml,
 * pae2const's constraints.yaml), or JSON such as bilbomd_job.json from a
 * results download. YAML and JSON go by the file extension; anything else is
 * read as a const.inp. The text stays in the browser: only the constraints
 * read from it are sent with the job.
 */
export const importConstraintsFile = (
  text: string,
  fileName: string,
  mode: ConstraintMode,
  segments: StructureSegment[],
  fixedBody?: number
): ConstraintsFileImport => {
  if (/\.(ya?ml|json)$/i.test(fileName)) {
    let data: unknown
    try {
      // YAML reads JSON too
      data = parseYaml(text, { maxAliasCount: 0 })
    } catch {
      return {
        input: null,
        problems: ['The file could not be read as YAML or JSON'],
        notes: [],
        fixedChoices: []
      }
    }
    const imported = importConstraintsFromData(data, mode, {
      structure: segments
    })
    return { ...imported, fixedChoices: [] }
  }

  const imported = importConstraintsFromConstInp(text, mode, {
    structure: segments,
    ...(fixedBody !== undefined ? { fixedBody } : {})
  })
  const needsChoice =
    imported.input === null && imported.fixed_choices.length > 1
  return {
    input: imported.input,
    problems: imported.problems.filter((p) => !p.includes(CHOOSE_FIXED)),
    notes: imported.notes,
    fixedChoices: needsChoice ? imported.fixed_choices : []
  }
}
