import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import { packEnclose, packSiblings } from 'd3-hierarchy'
import type { SimulationNodeDatum } from 'd3-force'
import { fixedColor, rigidColor } from './constraintColors'

// A bead-and-spring picture of a constraint file. Each constrained segment is
// a bead, every flexible stretch between two segments on a chain is a spring,
// fixed segments are pinned, and the segments of one rigid body move together.
// Positions are schematic: they show what can move relative to what, not the
// real 3D arrangement.

export type BodyKind = 'fixed' | 'rigid' | 'tail'

export interface Bead {
  chainId: string
  start: number
  stop: number
  // Residue count
  n: number
  r: number
  // Offset from the body's center
  ox: number
  oy: number
  body: SchematicBody
}

export interface SchematicBody extends SimulationNodeDatum {
  // What hovering highlights: every fixed segment shares 'fixed'
  key: string
  kind: BodyKind
  name: string
  // Index into the rigid-body palette; null for fixed segments and tails
  colorIndex: number | null
  beads: Bead[]
  // Radius of the circle enclosing the body's beads
  R: number
  residues: number
  pinned: boolean
  // Where a drag is pulling the body, if one is
  target: { x: number; y: number } | null
  x: number
  y: number
}

export interface Linker {
  a: Bead
  b: Bead
  chainId: string
  // Flexible residues between the two beads, inclusive
  start: number
  stop: number
  n: number
  // Surface-to-surface rest length (a loose coil) and full stretch
  rest: number
  max: number
}

export interface SchematicModel {
  bodies: SchematicBody[]
  // Constrained segments only; tails are bodies with a single small bead
  beads: Bead[]
  linkers: Linker[]
  chainIds: string[]
  fixedCount: number
  rigidCount: number
}

export const TAIL_RADIUS = 3

export const beadRadius = (n: number): number => 4.5 + 1.6 * Math.sqrt(n)

export const makeLinker = (
  a: Bead,
  b: Bead,
  chainId: string,
  start: number,
  stop: number
): Linker => {
  const n = Math.max(0, stop - start + 1)
  // A random coil spans ~√n; a fully stretched chain ~n
  const rest = n ? 8 * Math.sqrt(n) + 3 : 1.5
  const max = n ? Math.max(rest * 1.3, 3.4 * n) : 3
  return { a, b, chainId, start, stop, n, rest, max }
}

const newBody = (
  key: string,
  kind: BodyKind,
  name: string,
  colorIndex: number | null
): SchematicBody => ({
  key,
  kind,
  name,
  colorIndex,
  beads: [],
  R: 0,
  residues: 0,
  pinned: false,
  target: null,
  x: 0,
  y: 0
})

// Packs a body's beads into a tight cluster around its center
const packBeads = (body: SchematicBody) => {
  const circles = body.beads.map((bead) => ({
    r: bead.r + 2,
    bead,
    x: 0,
    y: 0
  }))
  packSiblings(circles)
  const enclosing = packEnclose(circles) ?? { x: 0, y: 0, r: 0 }
  for (const c of circles) {
    c.bead.ox = c.x - enclosing.x
    c.bead.oy = c.y - enclosing.y
  }
  body.R = enclosing.r
  body.residues = body.beads.reduce((sum, b) => sum + b.n, 0)
}

export const buildSchematicModel = (
  constraints: MDConstraintsDTO
): SchematicModel => {
  const bodies: SchematicBody[] = []
  const beads: Bead[] = []

  const addBody = (
    body: SchematicBody,
    segments: NonNullable<MDConstraintsDTO['rigid_bodies']>[number]['segments']
  ) => {
    for (const { chain_id, residues } of segments) {
      const n = residues.stop - residues.start + 1
      const bead: Bead = {
        chainId: chain_id,
        start: residues.start,
        stop: residues.stop,
        n,
        r: beadRadius(n),
        ox: 0,
        oy: 0,
        body
      }
      body.beads.push(bead)
      beads.push(bead)
    }
    if (body.beads.length === 0) return
    packBeads(body)
    bodies.push(body)
  }

  // Each fixed segment is its own body: the layout first settles it along its
  // linkers, then pins it
  for (const fixed of constraints.fixed_bodies ?? []) {
    for (const segment of fixed.segments ?? []) {
      addBody(newBody('fixed', 'fixed', 'Fixed', null), [segment])
    }
  }
  const fixedCount = bodies.length
  let rigidCount = 0
  for (const rigid of constraints.rigid_bodies ?? []) {
    const body = newBody(`rigid-${rigidCount}`, 'rigid', rigid.name, rigidCount)
    addBody(body, rigid.segments ?? [])
    if (body.beads.length) rigidCount++
  }

  const byChain = new Map<string, Bead[]>()
  for (const bead of beads) {
    byChain.set(bead.chainId, [...(byChain.get(bead.chainId) ?? []), bead])
  }
  const chainIds = [...byChain.keys()].sort()

  const linkers: Linker[] = []
  for (const chainId of chainIds) {
    const list = (byChain.get(chainId) ?? []).sort((a, b) => a.start - b.start)
    const first = list[0]
    if (!first) continue
    // Residues before the first constrained one hang free. Residues after the
    // last one aren't in the constraint file, so the chain stops there.
    if (first.start > 1) {
      const tail = newBody(
        `tail-${chainId}`,
        'tail',
        `Chain ${chainId} N-terminus`,
        null
      )
      const tip: Bead = {
        chainId,
        start: 0,
        stop: 0,
        n: 0,
        r: TAIL_RADIUS,
        ox: 0,
        oy: 0,
        body: tail
      }
      tail.beads.push(tip)
      tail.R = TAIL_RADIUS
      bodies.push(tail)
      linkers.push(makeLinker(tip, first, chainId, 1, first.start - 1))
    }
    let prev = first
    for (const bead of list.slice(1)) {
      if (bead.start > prev.stop) {
        linkers.push(
          makeLinker(prev, bead, chainId, prev.stop + 1, bead.start - 1)
        )
      }
      if (bead.stop > prev.stop) prev = bead
    }
  }

  return { bodies, beads, linkers, chainIds, fixedCount, rigidCount }
}

export const beadPosition = (bead: Bead) => ({
  x: bead.body.x + bead.ox,
  y: bead.body.y + bead.oy
})

const movable = (body: SchematicBody) => !body.pinned

// How a correction between two bodies is shared: a pinned body takes none
const shares = (a: SchematicBody, b: SchematicBody): [number, number] => {
  const ma = movable(a)
  const mb = movable(b)
  if (ma && mb) return [0.5, 0.5]
  return [ma ? 1 : 0, mb ? 1 : 0]
}

const surfaceGap = (linker: Linker) => {
  const a = beadPosition(linker.a)
  const b = beadPosition(linker.b)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1e-6
  return { dx, dy, d, gap: d - linker.a.r - linker.b.r }
}

export const isTaut = (linker: Linker): boolean =>
  linker.n > 0 && surfaceGap(linker).gap >= linker.max * 0.97

/** Pulls bodies back so no linker stretches past its full length. */
export const applyLinkerLimits = (model: SchematicModel, passes = 3): void => {
  for (let pass = 0; pass < passes; pass++) {
    for (const linker of model.linkers) {
      const { dx, dy, d, gap } = surfaceGap(linker)
      const over = gap - linker.max
      if (over <= 0) continue
      const [wa, wb] = shares(linker.a.body, linker.b.body)
      const ux = dx / d
      const uy = dy / d
      linker.a.body.x += ux * over * wa
      linker.a.body.y += uy * over * wa
      linker.b.body.x -= ux * over * wb
      linker.b.body.y -= uy * over * wb
    }
  }
}

/** Pushes apart beads of different bodies that overlap. */
export const applyBeadCollisions = (
  model: SchematicModel,
  spacing = 2
): void => {
  const all = model.bodies.flatMap((body) => body.beads)
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i] as Bead
      const q = all[j] as Bead
      if (p.body === q.body) continue
      if (!movable(p.body) && !movable(q.body)) continue
      const a = beadPosition(p)
      const b = beadPosition(q)
      let dx = b.x - a.x
      let dy = b.y - a.y
      let d = Math.hypot(dx, dy)
      if (d < 1e-3) {
        // Same spot: separate along a fixed direction so it stays deterministic
        dx = 1
        dy = 0
        d = 1
      }
      const overlap = p.r + q.r + spacing - d
      if (overlap <= 0) continue
      const [wp, wq] = shares(p.body, q.body)
      p.body.x -= (dx / d) * overlap * wp
      p.body.y -= (dy / d) * overlap * wp
      q.body.x += (dx / d) * overlap * wq
      q.body.y += (dy / d) * overlap * wq
    }
  }
}

/** d3 force: each linker pulls or pushes toward its rest length. */
export const springForce = (model: SchematicModel) => (alpha: number) => {
  for (const linker of model.linkers) {
    const { dx, dy, d, gap } = surfaceGap(linker)
    const f = (0.12 * (gap - linker.rest) * Math.max(alpha, 0.15)) / d
    const [wa, wb] = shares(linker.a.body, linker.b.body)
    const a = linker.a.body
    const b = linker.b.body
    a.vx = (a.vx ?? 0) + dx * f * wa
    a.vy = (a.vy ?? 0) + dy * f * wa
    b.vx = (b.vx ?? 0) - dx * f * wb
    b.vy = (b.vy ?? 0) - dy * f * wb
  }
}

/** d3 force: a dragged body follows the pointer, within its linkers. */
export const targetForce = (model: SchematicModel) => () => {
  for (const body of model.bodies) {
    if (!body.target) continue
    body.vx = (body.vx ?? 0) + (body.target.x - body.x) * 0.35
    body.vy = (body.vy ?? 0) + (body.target.y - body.y) * 0.35
  }
}

/**
 * d3 force: random kicks, smaller for heavier bodies, so the picture keeps
 * exploring the way an MD run would. `motion` 0 turns it off.
 */
export const thermalForce =
  (model: SchematicModel, motion: () => number, normal: () => number) => () => {
    const scale = motion()
    if (scale <= 0) return
    for (const body of model.bodies) {
      if (!movable(body) || body.target) continue
      const mass = body.kind === 'tail' ? 4 : body.residues
      const s = (scale * 2.4) / Math.sqrt(1 + mass / 25)
      body.vx = (body.vx ?? 0) + normal() * s
      body.vy = (body.vy ?? 0) + normal() * s
    }
  }

/** Places every body on a circle in sequence order, so linkers don't tangle. */
export const placeOnCircle = (
  model: SchematicModel,
  jitter: () => number
): void => {
  const first = (b: SchematicBody) => b.beads[0] as Bead
  const ordered = [...model.bodies].sort(
    (a, b) =>
      first(a).chainId.localeCompare(first(b).chainId) ||
      first(a).start - first(b).start
  )
  const radius = 60 + ordered.length * 9
  ordered.forEach((body, i) => {
    const angle = (i / Math.max(1, ordered.length)) * 2 * Math.PI - Math.PI / 2
    const r = radius + jitter() * 20
    body.pinned = false
    body.fx = null
    body.fy = null
    body.vx = 0
    body.vy = 0
    body.x = Math.cos(angle) * r
    body.y = Math.sin(angle) * r
  })
}

/** Pins every fixed segment where it is. */
export const pinFixed = (model: SchematicModel): void => {
  for (const body of model.bodies) {
    if (body.kind !== 'fixed') continue
    body.pinned = true
    body.fx = body.x
    body.fy = body.y
  }
}

/**
 * A wavy path between two points: as many waves as the linker is long, with
 * an amplitude that takes up the slack, so it flattens as it nears full
 * stretch.
 */
export const squigglePath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  n: number,
  maxLength: number
): string => {
  const f = (v: number) => v.toFixed(1)
  const dx = x2 - x1
  const dy = y2 - y1
  const d = Math.hypot(dx, dy) || 1e-6
  if (n <= 1) return `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`
  const waves = Math.max(1, Math.min(14, Math.round(n / 4)))
  const slack = Math.max(0, maxLength * maxLength - d * d)
  const amp = Math.min(9, Math.sqrt(slack) / (2.4 * waves))
  const px = -dy / d
  const py = dx / d
  const steps = waves * 8
  let path = `M${f(x1)},${f(y1)}`
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const o = amp * Math.sin(t * waves * 2 * Math.PI)
    path += `L${f(x1 + dx * t + px * o)},${f(y1 + dy * t + py * o)}`
  }
  return path
}

/** The linker's path from one bead's surface to the other's. */
export const linkerPath = (linker: Linker): string => {
  const a = beadPosition(linker.a)
  const b = beadPosition(linker.b)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1e-6
  const ux = dx / d
  const uy = dy / d
  return squigglePath(
    a.x + ux * linker.a.r,
    a.y + uy * linker.a.r,
    b.x - ux * linker.b.r,
    b.y - uy * linker.b.r,
    linker.n,
    linker.max
  )
}

export const formatRange = (chainId: string, start: number, stop: number) =>
  start === stop ? `${chainId} ${start}` : `${chainId} ${start}–${stop}`

const residueCount = (n: number) => `${n} residue${n === 1 ? '' : 's'}`

export const describeBody = (
  model: SchematicModel,
  body: SchematicBody
): string => {
  if (body.kind === 'tail') {
    const linker = model.linkers.find((l) => l.a.body === body)
    return `${body.name} · free end of ${linker?.n ?? 0} flexible residues`
  }
  const segments = body.beads
    .map((b) => formatRange(b.chainId, b.start, b.stop))
    .join(', ')
  if (body.kind === 'fixed') {
    const others = model.fixedCount - 1
    const rest = others
      ? `, like the other ${others} fixed segment${others === 1 ? '' : 's'}`
      : ''
    return `Fixed · ${segments} · ${residueCount(body.residues)} · held in place${rest}`
  }
  return `${body.name} · moves as one unit · ${segments} · ${residueCount(body.residues)}`
}

export const describeLinker = (linker: Linker): string =>
  `Flexible · ${formatRange(linker.chainId, linker.start, linker.stop)} · ${residueCount(linker.n)}`

/**
 * A view box around every body with room for labels, at least 560 × 320 and
 * no narrower than 1.4:1, so small systems don't fill the panel.
 */
export const fitViewBox = (model: SchematicModel) => {
  if (model.bodies.length === 0)
    return { x: -280, y: -160, width: 560, height: 320 }
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const b of model.bodies) {
    x0 = Math.min(x0, b.x - b.R - 12)
    x1 = Math.max(x1, b.x + b.R + 12)
    y0 = Math.min(y0, b.y - b.R - 28)
    y1 = Math.max(y1, b.y + b.R + 30)
  }
  const pad = 40
  let width = Math.max(560, x1 - x0 + 2 * pad)
  const height = Math.max(320, y1 - y0 + 2 * pad)
  if (width / height < 1.4) width = height * 1.4
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

/**
 * Which bodies' name labels fit: biggest body first, and a label that would
 * overlap one already placed is left out.
 */
export const visibleLabels = (
  bodies: SchematicBody[],
  labelY: (b: SchematicBody) => number
): Set<SchematicBody> => {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const shown = new Set<SchematicBody>()
  for (const body of [...bodies].sort((a, b) => b.R - a.R)) {
    const y = labelY(body)
    const w = body.name.length * 6.5 + 4
    const box = {
      x0: body.x - w / 2,
      x1: body.x + w / 2,
      y0: y - 11,
      y1: y + 3
    }
    const clash = placed.some(
      (p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0
    )
    if (clash) continue
    placed.push(box)
    shown.add(body)
  }
  return shown
}

export const bodyColor = (body: SchematicBody, dark: boolean): string => {
  if (body.kind === 'fixed') return fixedColor(dark)
  if (body.kind === 'tail' || body.colorIndex === null) {
    return dark ? '#9aa5b5' : '#5d6878'
  }
  return rigidColor(body.colorIndex, dark)
}
