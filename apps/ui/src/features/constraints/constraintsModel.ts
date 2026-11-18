import {
  segmentForChainSelection,
  type ConstraintMode,
  type ConstraintSegmentInput,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'

/**
 * The structure segment a constraint segment names: by segid, or for PDB
 * input without one, the way the validator resolves it (the chain's only
 * segment, or the one segment with residues in the range). Undefined when it
 * could be several, so the picker asks instead of guessing.
 */
export const segmentOf = (
  segments: StructureSegment[],
  value: ConstraintSegmentInput
): StructureSegment | undefined =>
  value.segid !== undefined
    ? segments.find((s) => s.segid === value.segid)
    : segmentForChainSelection(segments, value.chain_id, value.residues)

/**
 * A constraint segment for a structure segment. PDB input names the chain and
 * also the segid, since one chain can be several segments (separate
 * molecules that share a chain ID).
 */
export const segmentFor = (
  mode: ConstraintMode,
  s: StructureSegment,
  residues?: { start: number; stop: number }
): ConstraintSegmentInput => ({
  ...(mode === 'crd_psf' ? {} : { chain_id: s.chain_id }),
  segid: s.segid,
  ...(residues ? { residues } : {})
})

export const rangeOf = (s: StructureSegment) => ({
  start: s.residues[0] ?? 0,
  stop: s.residues[s.residues.length - 1] ?? 0
})

export const describeSegment = (mode: ConstraintMode, s: StructureSegment) => {
  const { start, stop } = rangeOf(s)
  return mode === 'crd_psf'
    ? `${s.segid} · residues ${start}–${stop}`
    : `Chain ${s.chain_id} (${s.segid}) · ${s.mol_type ?? ''} · residues ${start}–${stop}`
}

/** Every segment of the structure, whole: the starting point for new jobs */
export const defaultConstraints = (
  mode: ConstraintMode,
  segments: StructureSegment[]
): ConstraintsInput => ({
  fixed_bodies: [{ segments: segments.map((s) => segmentFor(mode, s)) }]
})
