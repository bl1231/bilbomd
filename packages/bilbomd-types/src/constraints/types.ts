import type { ChainMolType } from '../jobs/mdConstraints.js'

/**
 * Constraints as a client sends them: the `constraints` field of a job
 * submission, a JSON string. The server turns these into const.inp (CHARMM)
 * and the OpenMM constraints itself; users never send CHARMM text.
 */
export interface ConstraintSegmentInput {
  /** PDB chain ID. Required for PDB-mode jobs (Classic PDB, SANS). */
  chain_id?: string
  /**
   * CHARMM segment ID. Required for CRD/PSF jobs, where it must be one of the
   * PSF's segments. Optional for PDB-mode jobs, where the server works it out
   * from the structure (and a segid sent anyway must match).
   */
  segid?: string
  /** Inclusive residue range. Leave out to select the whole segment. */
  residues?: { start: number; stop: number }
}

export interface ConstraintBodyInput {
  segments: ConstraintSegmentInput[]
}

export interface ConstraintsInput {
  /** Exactly one fixed body: the reference frame that is held in place */
  fixed_bodies: ConstraintBodyInput[]
  /** Up to MAX_RIGID_BODIES bodies, each moved as one rigid unit */
  rigid_bodies?: ConstraintBodyInput[]
}

/** Which uploaded structure the constraints refer to */
export type ConstraintMode = 'pdb' | 'crd_psf'

/** One segment of the uploaded structure, as CHARMM will name it */
export interface StructureSegment {
  segid: string
  /**
   * PDB chain ID; for CRD/PSF structures, the chain the worker writes into
   * result PDBs (the segid's last character)
   */
  chain_id: string
  mol_type?: ChainMolType
  /** Residue numbers present, ascending, without duplicates */
  residues: number[]
  /**
   * Set when this segment starts at a chain break: the previous residue of
   * the chain (`after`) is not bonded to this segment's first one, being
   * `distance` A away. CHARMM builds the two sides as separate segments.
   */
  chain_break?: { after: number; distance: number }
}

export interface ConstraintStructure {
  mode: ConstraintMode
  segments: StructureSegment[]
}

/** A validated segment, as stored in md_constraints */
export interface ConstraintSegment {
  chain_id: string
  segid: string
  /** Always set: a whole segment gets the segment's first and last residue */
  residues: { start: number; stop: number }
  /** Selects the whole segment (written as `segid S` in const.inp) */
  whole_segment?: true
}

export interface ConstraintBody {
  name: string
  segments: ConstraintSegment[]
}

/** Validated constraints, the shape stored as md_constraints */
export interface Constraints {
  fixed_bodies: ConstraintBody[]
  rigid_bodies: ConstraintBody[]
}

export interface ConstraintError {
  /** Where in the input, e.g. "rigid_bodies[1].segments[0].residues" */
  path: string
  message: string
}

export type ConstraintsValidation =
  | { ok: true; constraints: Constraints; warnings: string[] }
  | { ok: false; errors: ConstraintError[] }
