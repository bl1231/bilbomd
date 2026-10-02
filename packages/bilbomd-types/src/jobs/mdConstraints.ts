interface ResidueRange {
  start: number
  stop: number
}

interface Segment {
  chain_id: string
  residues: ResidueRange
}

interface FixedBody {
  name: string
  segments: Segment[]
}

interface RigidBody {
  name: string
  segments: Segment[]
}

// pdb2crd's molecule-type segid prefixes (CAR = carbohydrate)
export type ChainMolType = 'PRO' | 'DNA' | 'RNA' | 'CAR'

export interface ChainMolTypeEntry {
  chain_id: string
  mol_type: ChainMolType
}

export interface MDConstraintsDTO {
  fixed_bodies?: FixedBody[]
  rigid_bodies?: RigidBody[]
  // Absent on jobs submitted before molecule types were recorded
  chain_mol_types?: ChainMolTypeEntry[]
}
