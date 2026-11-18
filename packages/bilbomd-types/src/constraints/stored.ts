import type { MDConstraintsDTO } from '../jobs/mdConstraints.js'
import type { ConstraintBody, ConstraintMode, Constraints } from './types.js'

type StoredBody = NonNullable<MDConstraintsDTO['fixed_bodies']>[number]

/**
 * A job's stored md_constraints as validated constraints, for rewriting its
 * const.inp, or null when they were stored before segids were recorded (older
 * jobs, and PAE-generated constraints) and so can't say what const.inp holds.
 */
export const constraintsFromStored = (
  stored: MDConstraintsDTO | null | undefined
): Constraints | null => {
  if (!stored) return null
  const bodies = (list: StoredBody[] | undefined): ConstraintBody[] | null => {
    const out: ConstraintBody[] = []
    for (const body of list ?? []) {
      const segments = []
      for (const s of body.segments) {
        if (!s.segid) return null
        segments.push({
          chain_id: s.chain_id,
          segid: s.segid,
          residues: { start: s.residues.start, stop: s.residues.stop },
          ...(s.whole_segment ? { whole_segment: true as const } : {})
        })
      }
      out.push({ name: body.name, segments })
    }
    return out
  }
  const fixed = bodies(stored.fixed_bodies)
  const rigid = bodies(stored.rigid_bodies)
  if (!fixed || !rigid || fixed.length === 0) return null
  return { fixed_bodies: fixed, rigid_bodies: rigid }
}

/**
 * Constraints in the stored or OpenMM shape (bodies of { chain_id, residues,
 * segid? }), turned back into input to validate again, e.g. a resubmitted
 * job's openmm_const.yml or its md_constraints from the database. Unknown
 * fields are kept, so the validator still rejects anything odd; stored
 * metadata is dropped: body names (the server names bodies), chain_mol_types,
 * and the `_id`/`id` MongoDB adds to every body, segment and residue range.
 */
export const inputFromStored = (
  stored: unknown,
  mode: ConstraintMode
): unknown => {
  if (!isRecord(stored)) return stored
  // chain_mol_types is metadata stored alongside the bodies; every other
  // field is kept so the validator rejects anything it doesn't know
  const {
    fixed_bodies: fixed,
    rigid_bodies: rigid,
    ...rest
  } = withoutDbIds(stored)
  delete rest.chain_mol_types

  const segment = (value: unknown): unknown => {
    if (!isRecord(value)) return value
    const {
      chain_id: chainId,
      segid,
      residues,
      whole_segment: whole,
      ...other
    } = withoutDbIds(value)
    return {
      ...other,
      // Segments are named by segid in CRD/PSF mode, by chain in PDB mode
      // (the server works out the segid from the structure)
      ...(mode === 'crd_psf' ? { segid } : { chain_id: chainId }),
      ...(whole === true
        ? {}
        : { residues: isRecord(residues) ? withoutDbIds(residues) : residues })
    }
  }
  const bodies = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((body: unknown): unknown => {
          if (!isRecord(body)) return body
          // The server names bodies, so a stored name is dropped
          const { segments, ...other } = withoutDbIds(body)
          delete other.name
          return {
            ...other,
            segments: Array.isArray(segments) ? segments.map(segment) : segments
          }
        })
      : list

  return {
    ...rest,
    fixed_bodies: bodies(fixed),
    ...(rigid === undefined || (Array.isArray(rigid) && rigid.length === 0)
      ? {}
      : { rigid_bodies: bodies(rigid) })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// MongoDB adds _id (and mongoose an id virtual) to every subdocument
const withoutDbIds = (value: Record<string, unknown>) => {
  const copy = { ...value }
  delete copy._id
  delete copy.id
  return copy
}
