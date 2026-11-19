import type {
  ChainMolType,
  Constraints,
  MDConstraintsDTO,
  StructureSegment
} from '@bilbomd/bilbomd-types'
import { segidMolType } from 'features/constraintSchematic/segmentKeys'

/**
 * Checked constraints in the form a job stores them (md_constraints), so the
 * job form can draw them the way the job page will: with each chain's
 * molecule type, one entry per viewer chain, the first segment keeping it
 * (the server's chainMolTypesOf does the same).
 */
export const previewConstraints = (
  constraints: Constraints,
  segments: StructureSegment[]
): MDConstraintsDTO => {
  const chain_mol_types: { chain_id: string; mol_type: ChainMolType }[] = []
  for (const s of segments) {
    const molType = s.mol_type ?? segidMolType(s.segid)
    if (molType && !chain_mol_types.some((c) => c.chain_id === s.chain_id)) {
      chain_mol_types.push({ chain_id: s.chain_id, mol_type: molType })
    }
  }
  return { ...constraints, chain_mol_types }
}
