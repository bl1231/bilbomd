import type { MDConstraintsDTO } from './jobs/mdConstraints.js'
import { readConstInp, type ConstInpSelection } from './constInpParser.js'

/**
 * Fewest flexible residues wanted between two constraint bodies on the same
 * chain, so the linker between them can move. Matches the min_gap that
 * pae2const.py enforces for Auto, AlphaFold and OpenFold jobs. For uploaded
 * constraints it is a warning, not a rule: jobs with smaller gaps have run
 * fine. Size and whether to enforce it are for a SAXS scientist to review
 * (#1101).
 */
export const MIN_FLEX_GAP = 2

/** Two bodies whose segments on one chain are closer than the minimum gap */
export interface CloseBodies {
  first: string
  second: string
  chain_id: string
  /** Residues strictly between the two segments (0 = adjacent) */
  gap: number
  first_range: string
  second_range: string
}

interface PlacedSegment {
  body: string
  fixed: boolean
  chain_id: string
  start: number
  stop: number
}

const segmentsOf = (constraints: MDConstraintsDTO): PlacedSegment[] => [
  ...(constraints.fixed_bodies ?? []).flatMap((body) =>
    body.segments.map((s) => ({
      body: body.name,
      fixed: true,
      chain_id: s.chain_id,
      start: s.residues.start,
      stop: s.residues.stop
    }))
  ),
  ...(constraints.rigid_bodies ?? []).flatMap((body) =>
    body.segments.map((s) => ({
      body: body.name,
      fixed: false,
      chain_id: s.chain_id,
      start: s.residues.start,
      stop: s.residues.stop
    }))
  )
]

/**
 * Pairs of bodies with fewer than `minGap` flexible residues between them on
 * a chain: fixed↔rigid and rigid↔rigid. Two fixed bodies are both held in
 * place, and segments of the same body move together, so neither needs a gap.
 * Overlapping segments are left to the overlap checks.
 */
export const findCloseBodies = (
  constraints: MDConstraintsDTO,
  minGap: number = MIN_FLEX_GAP
): CloseBodies[] => {
  const segments = segmentsOf(constraints)
  const close: CloseBodies[] = []
  segments.forEach((a, i) => {
    segments.slice(i + 1).forEach((b) => {
      if (a.chain_id !== b.chain_id || a.body === b.body) return
      if (a.fixed && b.fixed) return
      const [first, second] = a.start <= b.start ? [a, b] : [b, a]
      const gap = second.start - first.stop - 1
      if (gap < 0 || gap >= minGap) return
      close.push({
        first: first.body,
        second: second.body,
        chain_id: a.chain_id,
        gap,
        first_range: `${first.start}–${first.stop}`,
        second_range: `${second.start}–${second.stop}`
      })
    })
  })
  return close
}

/**
 * A warning for bodies closer than `minGap`, or null when every pair has room.
 */
export const closeBodiesMessage = (
  constraints: MDConstraintsDTO,
  minGap: number = MIN_FLEX_GAP
): string | null => {
  const close = findCloseBodies(constraints, minGap)
  if (close.length === 0) return null
  const pairs = close.map(
    (c) =>
      `${c.first} (${c.chain_id} ${c.first_range}) and ${c.second} ` +
      `(${c.second_range}): ${c.gap === 0 ? 'adjacent' : `${c.gap} residue${c.gap === 1 ? '' : 's'} between`}`
  )
  return (
    `Some bodies have fewer than ${minGap} flexible residues between them: ` +
    `${pairs.join('; ')}. Leaving at least ${minGap} flexible residues ` +
    'between bodies gives the linker room to move. You can still submit.'
  )
}

// --- Checks on const.inp text ----------------------------------------------
// These read the file with readConstInp, which understands every selection
// form the upload accepts (single residues, whole segments, several segids),
// and key segments by segid, so a carbohydrate segment CARA is never mistaken
// for protein chain A.

interface TextSegment {
  body: string
  fixed: boolean
  segid: string
  residues: ConstInpSelection['residues']
}

const textSegments = (text: string): TextSegment[] => {
  const { fixed_bodies, rigid_bodies } = readConstInp(text)
  return [
    ...fixed_bodies.flatMap((body) =>
      body.selections.map((sel) => ({ body: body.name, fixed: true, ...sel }))
    ),
    ...rigid_bodies.flatMap((body) =>
      body.selections.map((sel) => ({ body: body.name, fixed: false, ...sel }))
    )
  ]
}

/**
 * Residues a const.inp puts in two bodies: two rigid bodies, or a fixed and a
 * rigid one. A residue is either held in place or moves with one rigid body.
 * Two fixed bodies may share residues; segments of one body may too.
 * A whole-segment selection (`segid HETA`) overlaps anything on that segid.
 */
export const findConstInpOverlaps = (text: string): string[] => {
  const segments = textSegments(text)
  const overlaps: string[] = []
  segments.forEach((a, i) => {
    segments.slice(i + 1).forEach((b) => {
      if (a.segid !== b.segid || a.body === b.body) return
      if (a.fixed && b.fixed) return
      if (!a.residues || !b.residues) {
        overlaps.push(`${a.body} and ${b.body} both include segid ${a.segid}`)
        return
      }
      const start = Math.max(a.residues.start, b.residues.start)
      const stop = Math.min(a.residues.stop, b.residues.stop)
      if (start <= stop) {
        overlaps.push(
          `${a.body} and ${b.body} both include segid ${a.segid} residues ${start}-${stop}`
        )
      }
    })
  })
  return overlaps
}

/** Why the bodies in a const.inp overlap, or null when they don't. */
export const constInpOverlapMessage = (text: string): string | null => {
  const overlaps = findConstInpOverlaps(text)
  if (overlaps.length === 0) return null
  return (
    `Constraint bodies must not overlap: ${overlaps.join('; ')}. A residue is ` +
    'either held in place (fixed) or moves with one rigid body. Remove the ' +
    'shared residues from one of them.'
  )
}

/**
 * The close-bodies warning for a const.inp file, by segid. Whole-segment
 * selections have no range to measure from, so they are left out.
 */
export const constInpCloseBodiesMessage = (
  text: string,
  minGap: number = MIN_FLEX_GAP
): string | null => {
  const toBodies = (fixed: boolean) =>
    textSegments(text)
      .filter((seg) => seg.fixed === fixed && seg.residues)
      .reduce<
        Record<
          string,
          { chain_id: string; residues: { start: number; stop: number } }[]
        >
      >((bodies, seg) => {
        ;(bodies[seg.body] ??= []).push({
          chain_id: seg.segid,
          residues: seg.residues!
        })
        return bodies
      }, {})
  const asBodies = (bodies: ReturnType<typeof toBodies>) =>
    Object.entries(bodies).map(([name, segments]) => ({ name, segments }))
  return closeBodiesMessage(
    {
      fixed_bodies: asBodies(toBodies(true)),
      rigid_bodies: asBodies(toBodies(false))
    },
    minGap
  )
}
