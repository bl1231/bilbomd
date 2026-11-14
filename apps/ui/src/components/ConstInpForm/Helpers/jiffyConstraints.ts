import type { RigidBody } from 'types/interfaces'

/**
 * The jiffy's bodies (PRIMARY is the fixed one) in the shape the shared gap
 * check reads.
 */
export const jiffyConstraints = (rigidBodies: RigidBody[]) => {
  const toBody = (rb: RigidBody) => ({
    name: rb.id,
    segments: rb.domains.map((d) => ({
      chain_id: d.chainid,
      residues: { start: Number(d.start), stop: Number(d.end) }
    }))
  })
  return {
    fixed_bodies: rigidBodies.filter((rb) => rb.id === 'PRIMARY').map(toBody),
    rigid_bodies: rigidBodies.filter((rb) => rb.id !== 'PRIMARY').map(toBody)
  }
}
