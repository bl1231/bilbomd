import type { MDConstraintsDTO } from '../jobs/mdConstraints.js'
import type { Constraints } from './types.js'

/**
 * The constraints in the form the OpenMM scripts read (openmm_const.yml):
 * bodies of segments matched by PDB chain ID and an inclusive residue range.
 * A whole-segment selection is written as the segment's full range, since the
 * OpenMM scripts need a range. OpenMM runs only PDB-mode jobs, whose segments
 * are named by PDB chain.
 */
export const toOpenMMConstraints = (
  constraints: Constraints
): Required<Pick<MDConstraintsDTO, 'fixed_bodies' | 'rigid_bodies'>> => {
  const bodies = (list: Constraints['fixed_bodies']) =>
    list.map(({ name, segments }) => ({
      name,
      segments: segments.map(({ chain_id, residues }) => ({
        chain_id,
        residues: { start: residues.start, stop: residues.stop }
      }))
    }))
  return {
    fixed_bodies: bodies(constraints.fixed_bodies),
    rigid_bodies: bodies(constraints.rigid_bodies)
  }
}
