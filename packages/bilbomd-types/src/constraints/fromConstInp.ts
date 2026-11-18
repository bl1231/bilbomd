import { readConstInp, type ConstInpBody } from '../constInpParser.js'
import { findDuplicateShapeNames } from '../structureFileChecks.js'
import type {
  ConstraintBodyInput,
  ConstraintMode,
  ConstraintSegmentInput,
  ConstraintsInput,
  StructureSegment
} from './types.js'

/**
 * What an old const.inp file holds, as structured constraints. Used to import
 * a user's existing file in the browser; the text itself is never sent to the
 * server.
 */
export interface ConstInpImport {
  /**
   * The constraints, or null when they can't be used yet: no `cons fix`, or
   * several of them and no choice made (see `fixed_choices`).
   */
  input: ConstraintsInput | null
  /**
   * One entry per `cons fix` in the file. CHARMM keeps only the last one, so
   * several mean a mistake in the file: the user picks which is the fixed
   * body, passed back as `options.fixedBody`.
   */
  fixed_choices: ConstraintBodyInput[]
  /** Commands and names that were left out, to show the user */
  problems: string[]
}

// Segid prefixes the Inp Jiffy wrote for lowercase chains: PRLa, DNLa, RNLa
const LOWERCASE_PREFIXES: Record<string, true> = {
  PRL: true,
  DNL: true,
  RNL: true,
  CAL: true
}
const UPPERCASE_PREFIXES: Record<string, true> = {
  PRO: true,
  DNA: true,
  RNA: true,
  CAR: true
}

/**
 * The PDB chain a pdb2crd- or Inp-Jiffy-style segid names: PROA → A, DNAB →
 * B, CALC → c, PRLD → d. Null for any other segid.
 */
export const chainIdFromSegid = (segid: string): string | null => {
  const upper = segid.toUpperCase()
  if (upper.length !== 4) return null
  const prefix = upper.slice(0, 3)
  const chain = upper.slice(3)
  if (!/^[A-Z0-9]$/.test(chain)) return null
  if (UPPERCASE_PREFIXES[prefix]) return chain
  if (LOWERCASE_PREFIXES[prefix]) return chain.toLowerCase()
  return null
}

const toBody = (
  body: ConstInpBody,
  mode: ConstraintMode,
  problems: string[],
  structure: StructureSegment[] | undefined
): ConstraintBodyInput | null => {
  const segments: ConstraintSegmentInput[] = []
  for (const { segid: written, residues } of body.selections) {
    const segid = written.toUpperCase()
    const range = residues ? { residues: { ...residues } } : {}
    if (mode === 'crd_psf') {
      segments.push({ segid, ...range })
      continue
    }
    // The structure says which chain a segid is: BilboMD writes PROA for
    // protein chain `a` too, so the spelling alone can't tell a from A. Only
    // a segid the structure doesn't have (an old Inp Jiffy name such as PRLA)
    // is read by its spelling.
    const known = structure?.find((s) => s.segid === segid)
    const chainId = known?.chain_id ?? chainIdFromSegid(segid)
    if (chainId === null) {
      problems.push(
        structure
          ? `Segment ${written} in ${body.name} is not in the structure, so it was left out`
          : `Segment ${written} in ${body.name} is not a PDB chain segid (like PROA or DNAB), so it was left out`
      )
      continue
    }
    // A segid the structure has is kept: one chain can be several segments
    segments.push({
      chain_id: chainId,
      ...(known ? { segid } : {}),
      ...range
    })
  }
  return segments.length > 0 ? { segments } : null
}

/**
 * Reads an old const.inp into structured constraints. Commands other than
 * defines, `cons fix` and `shape desc` (including anything like `system`) are
 * left out and listed in `problems`. In PDB mode segments are named by chain,
 * and the server works out the segid; in CRD/PSF mode they keep their segid.
 *
 * Pass the uploaded structure's segments as `options.structure` so each segid
 * is matched to its chain (see toBody); `options.fixedBody` picks the fixed
 * body when the file has several `cons fix` commands.
 */
export const importConstraintsFromConstInp = (
  text: string,
  mode: ConstraintMode,
  options: { fixedBody?: number; structure?: StructureSegment[] } = {}
): ConstInpImport => {
  const report = readConstInp(text)
  const problems: string[] = [
    ...report.skipped.map((line) => `Left out: ${line}`),
    ...report.undefined_names.map(
      (name) => `"${name}" is used but never defined`
    ),
    // CHARMM treats a repeated shape name as a change to the earlier shape,
    // not a new rigid body, so the file doesn't mean what it seems to
    ...findDuplicateShapeNames(text).map(
      (name) =>
        `"shape desc ${name}" is used more than once. CHARMM would treat the repeat as a change to the earlier rigid body, not a new one. Give each rigid body its own name.`
    )
  ]

  const fixedChoices = report.fixed_bodies.flatMap((body) => {
    const read = toBody(body, mode, problems, options.structure)
    return read ? [read] : []
  })
  const rigid = report.rigid_bodies.flatMap((body) => {
    const read = toBody(body, mode, problems, options.structure)
    return read ? [read] : []
  })

  if (fixedChoices.length === 0) {
    problems.push('The file has no usable "cons fix" (fixed body)')
  } else if (fixedChoices.length > 1 && options.fixedBody === undefined) {
    problems.push(
      `The file has ${fixedChoices.length} "cons fix" commands, but CHARMM uses only the last one. Choose which is the fixed body.`
    )
  }

  const chosen =
    fixedChoices.length === 1
      ? fixedChoices[0]
      : options.fixedBody !== undefined
        ? fixedChoices[options.fixedBody]
        : undefined

  return {
    input: chosen
      ? {
          fixed_bodies: [chosen],
          ...(rigid.length > 0 ? { rigid_bodies: rigid } : {})
        }
      : null,
    fixed_choices: fixedChoices,
    problems
  }
}
