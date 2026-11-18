import type { MDConstraintsDTO } from '../jobs/mdConstraints.js'
import { fitSavedSelection } from './resolve.js'
import type {
  ConstraintBody,
  ConstraintMode,
  Constraints,
  StructureSegment
} from './types.js'

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
 *
 * Pass the structure's segments as `structure` in PDB mode, so a selection
 * saved when a chain was one segment is fitted to the segments it is built
 * as now (see fitSavedSelection): a whole chain A stored as PROA 1-203 is
 * PROA and PROB, not just PROA, once a chain break splits it.
 */
export const inputFromStored = (
  stored: unknown,
  mode: ConstraintMode,
  structure?: StructureSegment[]
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

  const segments = (value: unknown): unknown[] => {
    if (!isRecord(value)) return [value]
    const {
      chain_id: chainId,
      segid,
      residues,
      whole_segment: whole,
      ...other
    } = withoutDbIds(value)
    const range = isRecord(residues) ? withoutDbIds(residues) : residues
    if (mode === 'crd_psf') {
      // CRD/PSF segments are named by segid and come from the PSF as is
      return [
        { ...other, segid, ...(whole === true ? {} : { residues: range }) }
      ]
    }
    if (
      structure &&
      typeof chainId === 'string' &&
      (segid === undefined || typeof segid === 'string') &&
      isRange(range)
    ) {
      return fitSavedSelection(
        {
          chain_id: chainId,
          ...(segid === undefined ? {} : { segid }),
          residues: { start: range.start, stop: range.stop },
          whole_segment: whole === true
        },
        structure
      ).segments.map((s) => ({ ...other, ...s }))
    }
    // Segments are named by chain in PDB mode. A stored segid is kept: it
    // says which segment of a chain that is several molecules (and the
    // server checks it matches)
    return [
      {
        ...other,
        chain_id: chainId,
        ...(segid === undefined ? {} : { segid }),
        ...(whole === true ? {} : { residues: range })
      }
    ]
  }
  const bodies = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((body: unknown): unknown => {
          if (!isRecord(body)) return body
          // The server names bodies, so a stored name is dropped
          const { segments: segmentList, ...other } = withoutDbIds(body)
          delete other.name
          return {
            ...other,
            segments: Array.isArray(segmentList)
              ? segmentList.flatMap(segments)
              : segmentList
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

const isRange = (value: unknown): value is { start: number; stop: number } =>
  isRecord(value) &&
  Number.isInteger(value.start) &&
  Number.isInteger(value.stop) &&
  Object.keys(value).every((k) => k === 'start' || k === 'stop')

// MongoDB adds _id (and mongoose an id virtual) to every subdocument
const withoutDbIds = (value: Record<string, unknown>) => {
  const copy = { ...value }
  delete copy._id
  delete copy.id
  return copy
}
