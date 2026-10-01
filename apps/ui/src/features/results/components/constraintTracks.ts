import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'

export type Body = NonNullable<MDConstraintsDTO['fixed_bodies']>[number]
export type BodyType = 'fixed' | 'rigid'

// Same colors as the Molstar domain-color preset
export const BODY_COLORS: Record<BodyType, string> = {
  fixed: '#2f54eb',
  rigid: '#fa8c16'
}
export const BODY_LABELS: Record<BodyType, string> = {
  fixed: 'Fixed',
  rigid: 'Rigid'
}

type TrackSegment = {
  type: BodyType
  bodyName: string
  start: number
  stop: number
}

export type ChainTrack = {
  chainId: string
  length: number
  segments: TrackSegment[]
}

// Chain lengths aren't stored with the constraints, so each track runs from
// residue 1 to the highest constrained residue on that chain.
export const buildChainTracks = (
  constraints: MDConstraintsDTO
): ChainTrack[] => {
  const tracks = new Map<string, ChainTrack>()
  const add = (bodies: Body[] | undefined, type: BodyType) => {
    for (const body of bodies ?? []) {
      for (const { chain_id, residues } of body.segments ?? []) {
        const track = tracks.get(chain_id) ?? {
          chainId: chain_id,
          length: 0,
          segments: []
        }
        track.length = Math.max(track.length, residues.stop)
        track.segments.push({
          type,
          bodyName: body.name,
          start: residues.start,
          stop: residues.stop
        })
        tracks.set(chain_id, track)
      }
    }
  }
  add(constraints.fixed_bodies, 'fixed')
  add(constraints.rigid_bodies, 'rigid')
  return [...tracks.values()].sort((a, b) => a.chainId.localeCompare(b.chainId))
}
