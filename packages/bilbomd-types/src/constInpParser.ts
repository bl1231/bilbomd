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

/** One `define` as the file states it: a residue range on one segid. */
export interface ConstInpSelection {
  segid: string
  start: number
  stop: number
}

/** A fixed or rigid body read from const.inp, with its segids as written. */
export interface ConstInpBody {
  name: string
  selections: ConstInpSelection[]
}

/**
 * What `readConstInp` found in a const.inp file: the bodies, plus what it could
 * not use, so a caller that edits the file (the Inp Jiffy) can say what was
 * left out instead of dropping it silently.
 */
export interface ConstInpReport {
  fixed_bodies: ConstInpBody[]
  rigid_bodies: ConstInpBody[]
  /** Commands this parser does not read, e.g. 'cons harm' or other selections */
  skipped: string[]
  /** Names used in a 'cons fix' or 'shape desc' that no earlier define set */
  undefined_names: string[]
}

type Definitions = Record<string, ConstInpSelection>

const DEFINE =
  /define\s+(\w+)\s+sele\s+\(\s*resid\s+(\d+):(\d+)\s+\.and\.\s+segid\s+(\w+)\s*\)\s+end/
const CONS_FIX = /cons\s+fix\s+sele\s+(.+)\s+end/
const SHAPE_RIGID = /shape\s+desc\s+\w+\s+rigid\s+sele\s+(.+)\s+end/

/**
 * Reads the fixed and rigid bodies from a CHARMM const.inp file, keeping each
 * selection's segid, and reports the commands it could not read.
 *
 * CHARMM runs the file top to bottom: a 'define' may reuse an earlier name, and
 * each 'cons fix' / 'shape desc' uses the definitions current at that line. So
 * this parses in a single pass instead of collecting every define first.
 * Bodies are named FixedBody1…, RigidBody1… in file order.
 */
export const readConstInp = (inpContent: string): ConstInpReport => {
  // Join '-' continuation lines first, so a command wrapped over several lines
  // (as the Inp Jiffy writes long ones) is parsed whole. Then drop '!'
  // comments, so a trailing '! ... end ...' can't leak into a selection.
  // Title ('*') lines are not commands.
  const lines = joinConstInpLines(inpContent)
    .map((line) => (line.split('!')[0] ?? '').trim())
    .filter((line) => line && line !== 'return' && !line.startsWith('*'))

  const fixed_bodies: ConstInpBody[] = []
  const rigid_bodies: ConstInpBody[] = []
  const skipped: string[] = []
  const undefined_names: string[] = []
  const definitions: Definitions = {}

  // A selection such as "fixed1 .or. fixed2 .or. fixed3", using the
  // definitions current at that line
  const selectionsOf = (expr: string): ConstInpSelection[] =>
    expr.split(/\s*\.or\.\s*/).flatMap((raw) => {
      const name = raw.trim()
      const def = definitions[name]
      if (def) return [def]
      if (!undefined_names.includes(name)) undefined_names.push(name)
      return []
    })

  for (const line of lines) {
    const defineMatch = line.match(DEFINE)
    if (defineMatch) {
      const [, name, start, stop, segid] = defineMatch
      definitions[name as string] = {
        segid: segid as string,
        start: Number(start),
        stop: Number(stop)
      }
      continue
    }

    const fixMatch = line.match(CONS_FIX)
    if (fixMatch) {
      const selections = selectionsOf(fixMatch[1] as string)
      if (selections.length > 0) {
        fixed_bodies.push({
          name: `FixedBody${fixed_bodies.length + 1}`,
          selections
        })
      }
      continue
    }

    const rigidMatch = line.match(SHAPE_RIGID)
    if (rigidMatch) {
      const selections = selectionsOf(rigidMatch[1] as string)
      if (selections.length > 0) {
        rigid_bodies.push({
          name: `RigidBody${rigid_bodies.length + 1}`,
          selections
        })
      }
      continue
    }

    skipped.push(line)
  }

  return { fixed_bodies, rigid_bodies, skipped, undefined_names }
}

const toSegment = ({ segid, start, stop }: ConstInpSelection): Segment => ({
  chain_id: segidToChainId(segid),
  residues: { start, stop }
})

/**
 * Reads the fixed and rigid bodies from a CHARMM const.inp file, in the
 * structured form the worker stores as `md_constraints`. See `readConstInp`.
 */
export const parseConstInp = (inpContent: string): MDConstraintsDTO => {
  const { fixed_bodies, rigid_bodies } = readConstInp(inpContent)
  return {
    fixed_bodies: fixed_bodies.map(({ name, selections }) => ({
      name,
      segments: selections.map(toSegment)
    })),
    rigid_bodies: rigid_bodies.map(({ name, selections }) => ({
      name,
      segments: selections.map(toSegment)
    }))
  }
}
