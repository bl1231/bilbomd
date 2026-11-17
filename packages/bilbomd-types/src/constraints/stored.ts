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
 * job's openmm_const.yml. Unknown fields are kept, so the validator still
 * rejects anything odd; names are dropped since the server names bodies.
 */
export const inputFromStored = (
  stored: unknown,
  mode: ConstraintMode
): unknown => {
  if (typeof stored !== 'object' || stored === null) return stored
  const { fixed_bodies: fixed, rigid_bodies: rigid } = stored as {
    fixed_bodies?: unknown
    rigid_bodies?: unknown
  }
  const bodies = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((body: unknown): unknown => {
          if (typeof body !== 'object' || body === null) return body
          const { segments } = body as { segments?: unknown }
          if (!Array.isArray(segments)) return { segments }
          return {
            segments: segments.map((segment: unknown) => {
              if (typeof segment !== 'object' || segment === null) {
                return segment
              }
              const {
                chain_id: chainId,
                segid,
                residues,
                whole_segment: whole,
                ...rest
              } = segment as Record<string, unknown>
              return {
                ...rest,
                ...(mode === 'crd_psf'
                  ? { segid: segid ?? chainId }
                  : { chain_id: chainId }),
                ...(whole === true ? {} : { residues })
              }
            })
          }
        })
      : list
  return {
    fixed_bodies: bodies(fixed),
    ...(rigid === undefined || (Array.isArray(rigid) && rigid.length === 0)
      ? {}
      : { rigid_bodies: bodies(rigid) })
  }
}
