import type { MDConstraintsDTO } from './jobs/mdConstraints.js'
import { joinConstInpLines } from './structureFileChecks.js'

type Segment = NonNullable<
  MDConstraintsDTO['rigid_bodies']
>[number]['segments'][number]

/**
 * pdb2crd assigns segids as {MOL_TYPE}{chain_id}, where MOL_TYPE is one of
 * these prefixes. Carbohydrates use CAR (uppercase chain) or CAL (lowercase).
 */
export const SEGID_MOL_TYPE_PREFIXES = [
  'PRO',
  'DNA',
  'RNA',
  'CAR',
  'CAL'
] as const

/**
 * Extracts the PDB chain ID from a pdb2crd-style CHARMM segid.
 * e.g. "DNAD" → "D", "PROP" → "P", "RNAB" → "B", "CARG" → "G"
 * Falls back to the raw segid if no known prefix matches.
 */
export const segidToChainId = (segid: string): string => {
  for (const prefix of SEGID_MOL_TYPE_PREFIXES) {
    if (segid.startsWith(prefix) && segid.length > prefix.length) {
      return segid.slice(prefix.length)
    }
  }
  return segid
}

type Definitions = Record<
  string,
  { segid: string; start: number; stop: number }
>

// A selection such as "fixed1 .or. fixed2 .or. fixed3", using the definitions
// current at that line
const parseSelectionExpression = (
  expr: string,
  definitions: Definitions
): Segment[] =>
  expr
    .split(/\s*\.or\.\s*/)
    .map((name) => definitions[name.trim()])
    .filter((def) => def !== undefined)
    .map(({ segid, start, stop }) => ({
      chain_id: segidToChainId(segid),
      residues: { start, stop }
    }))

/**
 * Reads the fixed and rigid bodies from a CHARMM const.inp file, in the
 * structured form the worker stores as `md_constraints`.
 *
 * CHARMM runs the file top to bottom: a 'define' may reuse an earlier name, and
 * each 'cons fix' / 'shape desc' uses the definitions current at that line. So
 * this parses in a single pass instead of collecting every define first.
 * Bodies are named FixedBody1…, RigidBody1… in file order.
 */
export const parseConstInp = (inpContent: string): MDConstraintsDTO => {
  // Join '-' continuation lines first, so a command wrapped over several lines
  // (as the Inp Jiffy writes long ones) is parsed whole. Then drop '!'
  // comments, so a trailing '! ... end ...' can't leak into a selection.
  const lines = joinConstInpLines(inpContent)
    .map((line) => (line.split('!')[0] ?? '').trim())
    .filter((line) => line && line !== 'return')

  const fixed_bodies: NonNullable<MDConstraintsDTO['fixed_bodies']> = []
  const rigid_bodies: NonNullable<MDConstraintsDTO['rigid_bodies']> = []
  const definitions: Definitions = {}

  for (const line of lines) {
    const defineMatch = line.match(
      /define\s+(\w+)\s+sele\s+\(\s*resid\s+(\d+):(\d+)\s+\.and\.\s+segid\s+(\w+)\s*\)\s+end/
    )
    if (defineMatch) {
      const [, name, start, stop, segid] = defineMatch
      definitions[name as string] = {
        segid: segid as string,
        start: Number(start),
        stop: Number(stop)
      }
      continue
    }

    const fixMatch = line.match(/cons\s+fix\s+sele\s+(.+)\s+end/)
    if (fixMatch) {
      const segments = parseSelectionExpression(
        fixMatch[1] as string,
        definitions
      )
      if (segments.length > 0) {
        fixed_bodies.push({
          name: `FixedBody${fixed_bodies.length + 1}`,
          segments
        })
      }
      continue
    }

    const rigidMatch = line.match(
      /shape\s+desc\s+\w+\s+rigid\s+sele\s+(.+)\s+end/
    )
    if (rigidMatch) {
      const segments = parseSelectionExpression(
        rigidMatch[1] as string,
        definitions
      )
      if (segments.length > 0) {
        rigid_bodies.push({
          name: `RigidBody${rigid_bodies.length + 1}`,
          segments
        })
      }
    }
  }

  return { fixed_bodies, rigid_bodies }
}
