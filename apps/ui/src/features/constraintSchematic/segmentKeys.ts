import type { ChainMolType, MDConstraintsDTO } from '@bilbomd/bilbomd-types'

type Segment = { chain_id: string; segid?: string }

export interface SegmentKeys {
  /** Segments are told apart by segid instead of chain ID */
  bySegid: boolean
  /** The track (or schematic chain) a segment belongs to */
  keyOf: (segment: Segment) => string
  /** A track's name: "Chain A", or the segid itself */
  labelOf: (key: string) => string
}

const allSegments = (constraints: MDConstraintsDTO): Segment[] =>
  [
    ...(constraints.fixed_bodies ?? []),
    ...(constraints.rigid_bodies ?? [])
  ].flatMap((body) => body.segments ?? [])

/**
 * How the constraint views group segments into chains. They use the viewer's
 * chain IDs, but CRD/PSF segids can share one: PROA and DNAA are both chain
 * A, with their own residue numbering. Read as one chain they'd overlap and
 * hide each other, so when any chain ID holds two segids, every segment is
 * grouped and named by segid instead.
 */
export const segmentKeys = (constraints: MDConstraintsDTO): SegmentKeys => {
  const segidsByChain = new Map<string, Set<string>>()
  for (const { chain_id, segid } of allSegments(constraints)) {
    if (!segid) continue
    const segids = segidsByChain.get(chain_id) ?? new Set<string>()
    segids.add(segid)
    segidsByChain.set(chain_id, segids)
  }
  const bySegid = [...segidsByChain.values()].some((s) => s.size > 1)
  return {
    bySegid,
    keyOf: ({ chain_id, segid }) => (bySegid && segid ? segid : chain_id),
    labelOf: (key) => (bySegid ? key : `Chain ${key}`)
  }
}

/** The molecule type a pdb2crd-style segid prefix stands for */
export const segidMolType = (segid: string): ChainMolType | undefined => {
  const prefix = segid.slice(0, 3).toUpperCase()
  if (prefix === 'PRO' || prefix === 'DNA' || prefix === 'RNA') return prefix
  if (prefix === 'CAR' || prefix === 'CAL') return 'CAR'
  return undefined
}

/**
 * The molecule type of each track, keyed like the tracks. By segid, it's read
 * from the segid alone: chain_mol_types holds one type per chain ID, which
 * would be wrong for the chain's other segids.
 */
export const trackMolTypes = (
  constraints: MDConstraintsDTO,
  keys: SegmentKeys
): Partial<Record<string, ChainMolType>> => {
  const byChain = new Map(
    (constraints.chain_mol_types ?? []).map((c) => [c.chain_id, c.mol_type])
  )
  const types: Partial<Record<string, ChainMolType>> = {}
  for (const segment of allSegments(constraints)) {
    const key = keys.keyOf(segment)
    if (types[key]) continue
    const type =
      keys.bySegid && segment.segid
        ? segidMolType(segment.segid)
        : byChain.get(segment.chain_id)
    if (type) types[key] = type
  }
  return types
}
