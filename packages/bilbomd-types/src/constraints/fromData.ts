import { chainIdFromSegid } from './fromConstInp.js'
import { describeSplit, fitSavedSelection } from './resolve.js'
import type {
  ConstraintBodyInput,
  ConstraintMode,
  ConstraintSegmentInput,
  ConstraintsInput,
  StructureSegment
} from './types.js'

/** What a constraints file in YAML or JSON holds, as structured constraints */
export interface ConstraintsDataImport {
  /** The constraints, or null when the file holds no usable fixed body */
  input: ConstraintsInput | null
  /** What was left out or changed, to show the user */
  problems: string[]
  /**
   * Selections that were fitted to the structure's segments, e.g. a chain
   * now built as two segments, to show the user
   */
  notes: string[]
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Fields BilboMD writes besides the ones constraints use (body names, the
// database's ids, molecule types): left out without comment
const METADATA = new Set(['name', '_id', 'id', 'chain_mol_types'])

const unknownFields = (value: Json, known: string[]) =>
  Object.keys(value).filter((k) => !known.includes(k) && !METADATA.has(k))

/**
 * Reads constraints from a YAML or JSON file, already parsed: an OpenMM
 * constraints file (openmm_const.yml or openmm_config.yaml from a results
 * download, constraints.yaml from pae2const), bilbomd_job.json from a results
 * download (its md_constraints), or the `constraints` JSON the API takes.
 * Either `{ constraints: {...} }`, `{ md_constraints: {...} }` or the bodies
 * at the top.
 *
 * OpenMM holds every fixed body in place, so several fixed bodies are merged
 * into the one fixed body the editor has (unlike several `cons fix` in a
 * const.inp, where CHARMM keeps only the last). Fields other than chain_id,
 * segid, residues and whole_segment are left out and listed in `problems`.
 * In PDB mode a segment given only by segid is matched to its chain in the
 * structure; in CRD/PSF mode segments need a segid.
 */
export const importConstraintsFromData = (
  data: unknown,
  mode: ConstraintMode,
  options: { structure?: StructureSegment[] } = {}
): ConstraintsDataImport => {
  const problems: string[] = []
  const notes: string[] = []
  // { constraints } in OpenMM files, { md_constraints } in bilbomd_job.json
  // (the job snapshot in every results download), or bare bodies
  const root = !isObject(data)
    ? data
    : isObject(data.constraints)
      ? data.constraints
      : isObject(data.md_constraints)
        ? data.md_constraints
        : data
  if (!isObject(root)) {
    return {
      input: null,
      problems: [
        'The file does not hold constraints (fixed_bodies, rigid_bodies)'
      ],
      notes
    }
  }
  for (const field of unknownFields(root, ['fixed_bodies', 'rigid_bodies'])) {
    problems.push(`Left out field "${field}"`)
  }

  const segmentOf = (
    value: unknown,
    where: string
  ): ConstraintSegmentInput[] => {
    if (!isObject(value)) {
      problems.push(`${where}: not a segment, left out`)
      return []
    }
    for (const field of unknownFields(value, [
      'chain_id',
      'segid',
      'residues',
      'whole_segment'
    ])) {
      problems.push(`${where}: left out field "${field}"`)
    }
    const { chain_id: chainId, segid, residues, whole_segment: whole } = value
    const saved = isObject(residues)
      ? { start: residues.start, stop: residues.stop }
      : undefined
    const range = whole !== true && saved ? { residues: saved } : {}

    if (mode === 'crd_psf') {
      if (typeof segid !== 'string') {
        problems.push(`${where}: CRD/PSF jobs name segments by segid, left out`)
        return []
      }
      return [
        { segid: segid.toUpperCase(), ...range } as ConstraintSegmentInput
      ]
    }
    // A segid the structure has is kept: one chain can be several segments
    const known =
      typeof segid === 'string'
        ? options.structure?.find((s) => s.segid === segid.toUpperCase())
        : undefined
    // With only a segid to go on, its name can point at the wrong chain
    // (PROA is chain a when chain A is DNA), so one the structure doesn't
    // have is left out rather than guessed
    if (
      typeof chainId !== 'string' &&
      typeof segid === 'string' &&
      options.structure &&
      !known
    ) {
      problems.push(
        `${where}: segid ${segid} is not in the structure, so the segment was left out`
      )
      return []
    }
    const chain =
      typeof chainId === 'string'
        ? chainId
        : typeof segid === 'string'
          ? (known?.chain_id ?? chainIdFromSegid(segid))
          : null
    if (chain === null) {
      problems.push(`${where}: no chain_id, left out`)
      return []
    }
    const keptSegid =
      known && known.chain_id === chain ? { segid: known.segid } : {}
    // A file from an older job may select a chain that BilboMD now builds as
    // several segments; the saved range says how much of it was meant
    if (
      options.structure &&
      saved &&
      Number.isInteger(saved.start) &&
      Number.isInteger(saved.stop)
    ) {
      const selection = {
        chain_id: chain,
        ...(typeof segid === 'string' ? { segid } : {}),
        residues: saved as { start: number; stop: number },
        whole_segment: whole === true
      }
      const fitted = fitSavedSelection(selection, options.structure)
      if (fitted.split) {
        notes.push(`${where}: ${describeSplit(selection, fitted.segments)}`)
      }
      return fitted.segments
    }
    return [
      { chain_id: chain, ...keptSegid, ...range } as ConstraintSegmentInput
    ]
  }

  const bodiesOf = (
    list: unknown,
    kind: 'Fixed' | 'Rigid'
  ): ConstraintBodyInput[] => {
    if (list === undefined) return []
    if (!Array.isArray(list)) {
      problems.push(`${kind} bodies are not a list, left out`)
      return []
    }
    return list.flatMap((body: unknown, i) => {
      const where = `${kind} body ${i + 1}`
      if (!isObject(body) || !Array.isArray(body.segments)) {
        problems.push(`${where}: no segments, left out`)
        return []
      }
      for (const field of unknownFields(body, ['segments'])) {
        problems.push(`${where}: left out field "${field}"`)
      }
      const segments = body.segments.flatMap((s: unknown, j) =>
        segmentOf(s, `${where}, segment ${j + 1}`)
      )
      return segments.length > 0 ? [{ segments }] : []
    })
  }

  const fixed = bodiesOf(root.fixed_bodies, 'Fixed')
  const rigid = bodiesOf(root.rigid_bodies, 'Rigid')
  if (fixed.length === 0) {
    problems.push('The file has no usable fixed body')
    return { input: null, problems, notes }
  }
  if (fixed.length > 1) {
    problems.push(
      `The file's ${fixed.length} fixed bodies were merged into one: OpenMM holds all of them in place`
    )
  }
  return {
    input: {
      fixed_bodies: [{ segments: fixed.flatMap((b) => b.segments) }],
      ...(rigid.length > 0 ? { rigid_bodies: rigid } : {})
    },
    problems,
    notes
  }
}
