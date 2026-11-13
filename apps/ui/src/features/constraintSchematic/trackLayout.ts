import type {
  Bead,
  Linker,
  SchematicBody,
  SchematicModel
} from './schematicModel'

// The linear view: one track per chain on a shared residue scale, constrained
// segments as bars in their body's color, flexible residues as a thin line,
// and arcs joining the segments of each multi-segment rigid body.

export const TRACK_WIDTH = 900
const LABEL_WIDTH = 70
const RIGHT_PAD = 18
const ROW_HEIGHT = 70
// The track's center line, from the top of its row; arcs use the space above
const TRACK_OFFSET = 40
export const BAR_HEIGHT = 14

export interface TrackRow {
  chainId: string
  y: number
  // Highest constrained residue: the chain stops there, as in the bead view
  length: number
  x0: number
  x1: number
}

export interface TrackBar {
  x: number
  y: number
  width: number
}

export interface TrackLayout {
  width: number
  height: number
  rows: TrackRow[]
  segments: (TrackBar & { bead: Bead })[]
  // Hover areas over the flexible stretches
  gaps: (TrackBar & { linker: Linker })[]
  arcs: { body: SchematicBody; d: string }[]
}

export const layoutTracks = (model: SchematicModel): TrackLayout => {
  const lengths = new Map<string, number>()
  for (const bead of model.beads) {
    lengths.set(
      bead.chainId,
      Math.max(lengths.get(bead.chainId) ?? 0, bead.stop)
    )
  }
  const maxLength = Math.max(1, ...lengths.values())
  // Residue r spans [r - 0.5, r + 0.5]
  const x = (residue: number) =>
    LABEL_WIDTH +
    ((residue - 0.5) / maxLength) * (TRACK_WIDTH - LABEL_WIDTH - RIGHT_PAD)
  const rowIndex = new Map(model.chainIds.map((id, i) => [id, i]))
  const yOf = (chainId: string) =>
    (rowIndex.get(chainId) ?? 0) * ROW_HEIGHT + TRACK_OFFSET

  const rows = model.chainIds.map((chainId) => {
    const length = lengths.get(chainId) ?? 1
    return { chainId, y: yOf(chainId), length, x0: x(1), x1: x(length + 1) }
  })

  const bar = (chainId: string, start: number, stop: number): TrackBar => ({
    x: x(start),
    // Keep short segments visible on long chains
    width: Math.max(2.5, x(stop + 1) - x(start)),
    y: yOf(chainId) - BAR_HEIGHT / 2
  })

  const segments = model.beads.map((bead) => ({
    bead,
    ...bar(bead.chainId, bead.start, bead.stop)
  }))
  const gaps = model.linkers
    .filter((linker) => linker.n > 0)
    .map((linker) => ({
      linker,
      ...bar(linker.chainId, linker.start, linker.stop)
    }))

  const arcs: TrackLayout['arcs'] = []
  for (const body of model.bodies) {
    if (body.kind !== 'rigid' || body.beads.length < 2) continue
    const ordered = [...body.beads].sort(
      (a, b) =>
        (rowIndex.get(a.chainId) ?? 0) - (rowIndex.get(b.chainId) ?? 0) ||
        a.start - b.start
    )
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1] as Bead
      const b = ordered[i] as Bead
      const xa = (x(a.start) + x(a.stop + 1)) / 2
      const xb = (x(b.start) + x(b.stop + 1)) / 2
      const f = (v: number) => v.toFixed(1)
      if (a.chainId === b.chainId) {
        // An arch over the track, taller for segments further apart
        const y = yOf(a.chainId) - BAR_HEIGHT / 2 - 1
        const h = Math.min(26, 8 + Math.abs(xb - xa) * 0.1)
        arcs.push({
          body,
          d: `M${f(xa)},${f(y)}C${f(xa)},${f(y - h)} ${f(xb)},${f(y - h)} ${f(xb)},${f(y)}`
        })
      } else {
        // From under the upper chain's bar down to the top of the lower one
        const ya = yOf(a.chainId) + BAR_HEIGHT / 2 + 1
        const yb = yOf(b.chainId) - BAR_HEIGHT / 2 - 1
        const bend = Math.max(18, (yb - ya) * 0.45)
        arcs.push({
          body,
          d: `M${f(xa)},${f(ya)}C${f(xa)},${f(ya + bend)} ${f(xb)},${f(yb - bend)} ${f(xb)},${f(yb)}`
        })
      }
    }
  }

  return {
    width: TRACK_WIDTH,
    height: model.chainIds.length * ROW_HEIGHT + 10,
    rows,
    segments,
    gaps,
    arcs
  }
}
