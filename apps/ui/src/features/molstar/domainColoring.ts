import {
  domainColor,
  hexToRgb,
  type AlignmentReport
} from 'features/jobdetail/rigidDomains'

// What the viewer's "Color by Domain" mode paints. For MD jobs these are the
// fixed and rigid bodies of the job's constraints, in the viewer's two
// standard colors. A body may carry its own color (0xRRGGBB) instead: BioEmu2
// jobs have no constraints, and are colored by the rigid domains found in
// their sampled structures (see alignmentDomainColoring).
interface ColoredBody {
  name: string
  color?: number
  segments: { chain_id: string; residues: { start: number; stop: number } }[]
}

export interface DomainColoring {
  fixed_bodies?: ColoredBody[]
  rigid_bodies?: ColoredBody[]
}

const colorValue = (domain: number): number => {
  // The viewer's canvas is always light, so use the light palette
  const [r, g, b] = hexToRgb(domainColor(domain, false))
  return (r << 16) | (g << 8) | b
}

// "A:2-13" -> a segment; null for anything unreadable
const parseRange = (range: string): ColoredBody['segments'][number] | null => {
  const match = /^(.+):(-?\d+)-(-?\d+)$/.exec(range)
  if (!match) return null
  const [, chain_id = '', start = '', stop = ''] = match
  return {
    chain_id,
    residues: { start: Number(start), stop: Number(stop) }
  }
}

// The rigid domains of a BioEmu2 job as a coloring, in the same colors as the
// Rigid Domains tab: the anchor (domain 1) as the fixed body, the others as
// rigid bodies, flexible residues left to the viewer. Undefined when no rigid
// domain was found, so there is nothing to color by.
export const alignmentDomainColoring = (
  report: AlignmentReport | undefined
): DomainColoring | undefined => {
  if (!report || report.method !== 'rigid-domain') return undefined
  const bodies: ColoredBody[] = report.domains
    .map((domain) => ({
      name: `domain-${domain.id}`,
      color: colorValue(domain.id),
      segments: domain.residues
        .map(parseRange)
        .filter((s): s is NonNullable<typeof s> => s !== null)
    }))
    .filter((body) => body.segments.length > 0)
  const [anchor, ...others] = bodies
  if (!anchor) return undefined
  return { fixed_bodies: [anchor], rigid_bodies: others }
}
