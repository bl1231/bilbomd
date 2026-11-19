import { useMemo } from 'react'
import { stringify as stringifyYaml } from 'yaml'
import {
  importConstraintsFromConstInp,
  toOpenMMConstraints,
  validateConstraintsInput,
  type ConstraintsValidation,
  type Constraints,
  type MDConstraintsDTO,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { constraintsFromConstInp } from 'features/constraintSchematic/constInpConstraints'
import { previewConstraints } from './previewConstraints'

export interface JiffyConstraints {
  /** The const.inp the Jiffy made */
  constInp: string
  /** Its checks, as a job form would run them; null until there is a structure */
  checked: ConstraintsValidation | null
  /** The checked constraints, when they pass */
  valid: Constraints | null
  /** What to draw: the checked constraints, or the file read alone */
  drawn: MDConstraintsDTO | null
  /** The same constraints as openmm_const.yml, when they pass */
  openmmYaml: string | null
}

/**
 * A Jiffy's const.inp read back the way a job form reads it, against the
 * structure's segments as BilboMD builds them, and checked the way BilboMD
 * will check it for a PDB job (OpenMM). The OpenMM YAML is written from the
 * checked constraints, the way BilboMD writes openmm_const.yml.
 */
export const useJiffyConstraints = (
  constInp: string,
  segments: StructureSegment[] | null
): JiffyConstraints => {
  const checked = useMemo(() => {
    if (!segments || segments.length === 0) return null
    const imported = importConstraintsFromConstInp(constInp, 'pdb', {
      structure: segments
    })
    if (!imported.input) return null
    return validateConstraintsInput(imported.input, {
      mode: 'pdb',
      segments,
      engine: 'openmm'
    })
  }, [constInp, segments])
  const valid = checked?.ok ? checked.constraints : null
  const drawn = useMemo(
    () =>
      valid && segments
        ? previewConstraints(valid, segments)
        : constraintsFromConstInp(constInp),
    [valid, segments, constInp]
  )
  const openmmYaml = useMemo(
    () =>
      valid
        ? stringifyYaml(
            { constraints: toOpenMMConstraints(valid) },
            { indent: 2, lineWidth: 0 }
          )
        : null,
    [valid]
  )
  return { constInp, checked, valid, drawn, openmmYaml }
}
