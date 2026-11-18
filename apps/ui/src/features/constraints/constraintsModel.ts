import type {
  ConstraintMode,
  ConstraintSegmentInput,
  ConstraintsInput,
  StructureSegment
} from '@bilbomd/bilbomd-types'

/** The key that names a segment in the input: chain (PDB) or segid (CRD) */
export const keyOf = (mode: ConstraintMode, s: StructureSegment) =>
  mode === 'crd_psf' ? s.segid : s.chain_id

export const segmentFor = (
  mode: ConstraintMode,
  s: StructureSegment,
  residues?: { start: number; stop: number }
): ConstraintSegmentInput => ({
  ...(mode === 'crd_psf' ? { segid: s.segid } : { chain_id: s.chain_id }),
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
    : `Chain ${s.chain_id} · ${s.mol_type ?? ''} · residues ${start}–${stop}`
}

/** Every segment of the structure, whole: the starting point for new jobs */
export const defaultConstraints = (
  mode: ConstraintMode,
  segments: StructureSegment[]
): ConstraintsInput => ({
  fixed_bodies: [{ segments: segments.map((s) => segmentFor(mode, s)) }]
})
