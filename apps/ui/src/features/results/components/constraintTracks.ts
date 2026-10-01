import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'

export type Body = NonNullable<MDConstraintsDTO['fixed_bodies']>[number]
export type BodyType = 'fixed' | 'rigid'

// Same colors as the Molstar domain-color preset
export const BODY_COLORS: Record<BodyType, string> = {
  fixed: '#2f54eb',
  rigid: '#fa8c16'
}
// Unconstrained residues; not a body type, so kept apart from BODY_COLORS
export const FLEXIBLE_COLOR = '#b7eb8f'

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

export type ResidueRange = { start: number; stop: number }

export type ChainTrack = {
  chainId: string
  length: number
  segments: TrackSegment[]
  // Residues in no fixed or rigid body, which move freely during MD
  flexible: ResidueRange[]
}

// Gaps between constrained segments, from residue 1 to the end of the track
const flexibleRanges = ({ length, segments }: ChainTrack): ResidueRange[] => {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const gaps: ResidueRange[] = []
  let next = 1
  for (const { start, stop } of sorted) {
    if (start > next) gaps.push({ start: next, stop: start - 1 })
    next = Math.max(next, stop + 1)
  }
  if (next <= length) gaps.push({ start: next, stop: length })
  return gaps
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
          segments: [],
          flexible: []
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
  return [...tracks.values()]
    .map((track) => ({ ...track, flexible: flexibleRanges(track) }))
    .sort((a, b) => a.chainId.localeCompare(b.chainId))
}
