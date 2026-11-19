import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import {
  fixedColor,
  rigidColor,
  rigidColorIndices
} from 'features/constraintSchematic/constraintColors'
import { segmentKeys } from 'features/constraintSchematic/segmentKeys'

export type Body = NonNullable<MDConstraintsDTO['fixed_bodies']>[number]
export type BodyType = 'fixed' | 'rigid'

// A body's color, from the palette every constraint view shares: fixed
// segments are blue, and each rigid body has its own color
export const bodyTypeColor = (
  type: BodyType,
  colorIndex: number | null,
  dark: boolean
): string =>
  type === 'fixed' || colorIndex === null
    ? fixedColor(dark)
    : rigidColor(colorIndex, dark)

export const BODY_LABELS: Record<BodyType, string> = {
  fixed: 'Fixed',
  rigid: 'Rigid'
}

type TrackSegment = {
  type: BodyType
  bodyName: string
  // The rigid body's palette index; null for fixed segments
  colorIndex: number | null
  start: number
  stop: number
}

export type ResidueRange = { start: number; stop: number }

export type ChainTrack = {
  // What the track is keyed by: the chain ID, or the segid when segids
  // share chain IDs (see segmentKeys)
  key: string
  // "Chain A", or the segid
  label: string
  // The viewer's chain ID
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
  const keys = segmentKeys(constraints)
  const tracks = new Map<string, ChainTrack>()
  const add = (
    bodies: Body[] | undefined,
    type: BodyType,
    colorIndex: (i: number) => number | null
  ) => {
    for (const [i, body] of (bodies ?? []).entries()) {
      for (const segment of body.segments ?? []) {
        const { chain_id, residues } = segment
        const key = keys.keyOf(segment)
        const track = tracks.get(key) ?? {
          key,
          label: keys.labelOf(key),
          chainId: chain_id,
          length: 0,
          segments: [],
          flexible: []
        }
        track.length = Math.max(track.length, residues.stop)
        track.segments.push({
          type,
          bodyName: body.name,
          colorIndex: colorIndex(i),
          start: residues.start,
          stop: residues.stop
        })
        tracks.set(key, track)
      }
    }
  }
  const rigidIndices = rigidColorIndices(constraints)
  add(constraints.fixed_bodies, 'fixed', () => null)
  add(constraints.rigid_bodies, 'rigid', (i) => rigidIndices[i] ?? null)
  // By chain; segids sharing a chain stay in the order the bodies list them
  return [...tracks.values()]
    .map((track) => ({ ...track, flexible: flexibleRanges(track) }))
    .sort((a, b) => a.chainId.localeCompare(b.chainId))
}
