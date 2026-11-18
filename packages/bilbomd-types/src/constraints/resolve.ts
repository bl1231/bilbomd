import type { ConstraintSegmentInput, StructureSegment } from './types.js'

interface Range {
  start: number
  stop: number
}

const hasResidueIn = (s: StructureSegment, range: Range) =>
  s.residues.some((r) => r >= range.start && r <= range.stop)

const spanOf = (s: StructureSegment): Range | null => {
  const first = s.residues[0]
  const last = s.residues[s.residues.length - 1]
  return first === undefined || last === undefined
    ? null
    : { start: first, stop: last }
}

/**
 * The structure segment a PDB-mode selection by chain (and maybe residues)
 * names, resolved the way the validator does it: the chain's only segment,
 * or else the one segment of the chain with residues in the range. Undefined
 * when the chain has no such segment or the selection could mean several.
 */
export const segmentForChainSelection = (
  structure: StructureSegment[],
  chainId: string | undefined,
  range: Range | undefined
): StructureSegment | undefined => {
  const chain = structure.filter((s) => s.chain_id === chainId)
  if (chain.length <= 1) return chain[0]
  if (!range) return undefined
  const hits = chain.filter((s) => hasResidueIn(s, range))
  return hits.length === 1 ? hits[0] : undefined
}

/** A selection from a saved job or file, before it is fitted to a structure */
export interface SavedSelection {
  chain_id: string
  segid?: string
  /** The residues selected, also for a whole segment when they were saved */
  residues?: Range
  whole_segment?: boolean
}

/**
 * Fits a saved PDB-mode selection to the structure's segments as BilboMD
 * builds them now. A chain can be several segments (separate molecules, or
 * the two sides of a chain break), so a selection saved when the chain was
 * one segment, e.g. PROA residues 1-203 that is now PROA 1-123 and PROB
 * 130-203, would otherwise keep only its first piece. Such a selection is
 * split into one selection per segment it covers, each the whole segment
 * when the saved range covers all of it.
 *
 * `split` is true when the selection now covers several segments. When the
 * segments can't be told apart by residue number (strands that share a chain
 * ID and numbering), the selection is returned without a segid, so the
 * validator asks for the segment to be picked again.
 */
export const fitSavedSelection = (
  saved: SavedSelection,
  structure: StructureSegment[]
): { segments: ConstraintSegmentInput[]; split: boolean } => {
  const { chain_id: chainId, segid, residues, whole_segment: whole } = saved
  const keep = (s: ConstraintSegmentInput) => ({ segments: [s], split: false })
  const chain = structure.filter((s) => s.chain_id === chainId)
  const named = segid
    ? chain.find((s) => s.segid === segid.toUpperCase())
    : undefined

  if (!residues) {
    // Nothing saved says how far the selection went
    return keep({
      chain_id: chainId,
      ...(named ? { segid: named.segid } : {})
    })
  }

  // The named segment still holds the whole saved range
  const namedSpan = named ? spanOf(named) : null
  if (
    named &&
    namedSpan &&
    residues.start >= namedSpan.start &&
    residues.stop <= namedSpan.stop
  ) {
    const all =
      whole === true &&
      residues.start === namedSpan.start &&
      residues.stop === namedSpan.stop
    return keep({
      chain_id: chainId,
      segid: named.segid,
      ...(all ? {} : { residues: { ...residues } })
    })
  }

  const hits = chain.filter((s) => hasResidueIn(s, residues))
  if (hits.length === 0) {
    // Let the validator say the residues aren't there
    return keep({ chain_id: chainId, residues: { ...residues } })
  }
  const ambiguous = hits.some((a, i) =>
    hits
      .slice(i + 1)
      .some((b) => a.residues.some((r) => b.residues.includes(r)))
  )
  if (ambiguous) {
    return keep({ chain_id: chainId, residues: { ...residues } })
  }
  return {
    segments: hits.map((s) => {
      const span = spanOf(s)!
      const start = Math.max(residues.start, span.start)
      const stop = Math.min(residues.stop, span.stop)
      const all = start === span.start && stop === span.stop
      return {
        chain_id: chainId,
        segid: s.segid,
        ...(all && whole === true ? {} : { residues: { start, stop } })
      }
    }),
    split: hits.length > 1
  }
}

/** "PROA and PROB", for telling the user where a selection went */
export const describeSplit = (
  saved: SavedSelection,
  segments: ConstraintSegmentInput[]
) => {
  const names = segments.map((s) => s.segid ?? '?').join(' and ')
  const range = saved.residues
    ? ` residues ${saved.residues.start}-${saved.residues.stop}`
    : ''
  return `Chain ${saved.chain_id}${range} is now segments ${names} (separate molecules, or a chain break), so all of them were selected`
}
