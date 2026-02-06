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

export interface MDConstraintsDTO {
  fixed_bodies?: FixedBody[]
  rigid_bodies?: RigidBody[]
}
