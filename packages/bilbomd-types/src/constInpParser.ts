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

/**
 * One selection from a `define`: a residue range on one segid, or the whole
 * segment when the define names only the segid (`residues` null).
 */
export interface ConstInpSelection {
  segid: string
  residues: { start: number; stop: number } | null
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

// Index of the ')' that closes the '(' at `open`, or -1
const closingParen = (text: string, open: number): number => {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

// "( ( x ) )" → "x"; "(a) .or. (b)" stays as it is
const stripParens = (text: string): string => {
  let t = text.trim()
  while (t.startsWith('(') && closingParen(t, 0) === t.length - 1) {
    t = t.slice(1, -1).trim()
  }
  return t
}

// Splits on '.and.' or '.or.' outside parentheses, ignoring case
const splitTop = (text: string, op: '.and.' | '.or.'): string[] => {
  const parts: string[] = []
  const lower = text.toLowerCase()
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (depth === 0 && lower.startsWith(op, i)) {
      parts.push(text.slice(from, i).trim())
      from = i + op.length
      i = from - 1
    }
  }
  parts.push(text.slice(from).trim())
  return parts
}

const RESID = /^resi\w*\s+(\d+)(?:\s*:\s*(\d+))?$/i
const SEGID = /^segi\w*\s+(\w+)$/i

// "resid 1:20 .and. ( segid PROA .or. segid PROB )", "segid HETA",
// "resid 5 .and. segid CARB": at most one resid term and one segid group
const parseConjunction = (text: string): ConstInpSelection[] | null => {
  let residues: ConstInpSelection['residues'] = null
  let segids: string[] | null = null
  for (const part of splitTop(stripParens(text), '.and.').map(stripParens)) {
    const resid = part.match(RESID)
    if (resid) {
      if (residues) return null
      const start = Number(resid[1])
      residues = { start, stop: resid[2] ? Number(resid[2]) : start }
      continue
    }
    const ids = splitTop(part, '.or.').map(
      (alt) => stripParens(alt).match(SEGID)?.[1]
    )
    if (segids || ids.some((id) => !id)) return null
    segids = ids as string[]
  }
  return segids ? segids.map((segid) => ({ segid, residues })) : null
}

/**
 * The atoms a `define … sele <expr> end` selects, as segid selections, or null
 * for a selection this parser doesn't read. Reads residue ranges or single
 * residues on one or several segids, whole segids, and '.or.' lists of these.
 * An '.and.' inside an '.or.' list must be in parentheses, since how CHARMM
 * groups them otherwise is easy to get wrong.
 */
const parseSelection = (expr: string): ConstInpSelection[] | null => {
  const alternatives = splitTop(stripParens(expr), '.or.')
  if (alternatives.length === 1) return parseConjunction(alternatives[0] ?? '')
  const selections: ConstInpSelection[] = []
  for (const alt of alternatives) {
    const inner = stripParens(alt)
    if (inner === alt.trim() && splitTop(alt, '.and.').length > 1) return null
    const parsed = parseConjunction(inner)
    if (!parsed) return null
    selections.push(...parsed)
  }
  return selections
}

const DEFINE = /^define\s+(\w+)\s+sele\w*\s+(.+?)\s+end$/i
const CONS_FIX = /cons\s+fix\s+sele\w*\s+(.+)\s+end/i
const SHAPE_RIGID = /shape\s+desc\w*\s+\w+\s+rigid\s+sele\w*\s+(.+)\s+end/i

// What parseConstInp has always read, kept apart so its output (which the
// worker turns into OpenMM constraints) does not change with readConstInp
const LEGACY_DEFINE =
  /define\s+(\w+)\s+sele\s+\(\s*resid\s+(\d+):(\d+)\s+\.and\.\s+segid\s+(\w+)\s*\)\s+end/
const LEGACY_CONS_FIX = /cons\s+fix\s+sele\s+(.+)\s+end/
const LEGACY_SHAPE_RIGID = /shape\s+desc\s+\w+\s+rigid\s+sele\s+(.+)\s+end/

const scanConstInp = (
  inpContent: string
): { report: ConstInpReport; legacy: MDConstraintsDTO } => {
  // Join '-' continuation lines first, so a command wrapped over several lines
  // (as the Inp Jiffy writes long ones) is parsed whole. Then drop '!'
  // comments, so a trailing '! ... end ...' can't leak into a selection.
  // Title ('*') lines are not commands.
  const lines = joinConstInpLines(inpContent)
    .map((line) => (line.split('!')[0] ?? '').trim())
    .filter(
      (line) => line && line.toLowerCase() !== 'return' && !line.startsWith('*')
    )

  const report: ConstInpReport = {
    fixed_bodies: [],
    rigid_bodies: [],
    skipped: [],
    undefined_names: []
  }
  const legacyFixed: NonNullable<MDConstraintsDTO['fixed_bodies']> = []
  const legacyRigid: NonNullable<MDConstraintsDTO['rigid_bodies']> = []

  const definitions: Record<string, ConstInpSelection[]> = {}
  // Defines this parser couldn't read: already in `skipped`, so a later use
  // of the name isn't reported again as undefined
  const unreadable = new Set<string>()
  const legacyDefinitions: Record<string, Segment> = {}

  // "fixed1 .or. fixed2 .or. fixed3", using the definitions current at that line
  const selectionsOf = (expr: string): ConstInpSelection[] =>
    expr.split(/\s*\.or\.\s*/i).flatMap((raw) => {
      const name = raw.trim()
      const defined = definitions[name]
      if (defined) return defined
      if (!unreadable.has(name) && !report.undefined_names.includes(name)) {
        report.undefined_names.push(name)
      }
      return []
    })
  const legacySegmentsOf = (expr: string): Segment[] =>
    expr
      .split(/\s*\.or\.\s*/)
      .map((name) => legacyDefinitions[name.trim()])
      .filter((segment) => segment !== undefined)

  for (const line of lines) {
    const legacyDefine = line.match(LEGACY_DEFINE)
    if (legacyDefine) {
      const [, name, start, stop, segid] = legacyDefine
      legacyDefinitions[name as string] = {
        chain_id: segidToChainId(segid as string),
        residues: { start: Number(start), stop: Number(stop) }
      }
    }

    const define = line.match(DEFINE)
    if (define) {
      const name = define[1] as string
      const selections = parseSelection(define[2] as string)
      if (selections) {
        definitions[name] = selections
        unreadable.delete(name)
      } else {
        delete definitions[name]
        unreadable.add(name)
        report.skipped.push(line)
      }
      continue
    }
    if (legacyDefine) continue

    const fix = line.match(CONS_FIX)
    if (fix) {
      const selections = selectionsOf(fix[1] as string)
      if (selections.length > 0) {
        report.fixed_bodies.push({
          name: `FixedBody${report.fixed_bodies.length + 1}`,
          selections
        })
      }
      const legacyFix = line.match(LEGACY_CONS_FIX)
      const segments = legacyFix ? legacySegmentsOf(legacyFix[1] as string) : []
      if (segments.length > 0) {
        legacyFixed.push({
          name: `FixedBody${legacyFixed.length + 1}`,
          segments
        })
      }
      continue
    }

    const rigid = line.match(SHAPE_RIGID)
    if (rigid) {
      const selections = selectionsOf(rigid[1] as string)
      if (selections.length > 0) {
        report.rigid_bodies.push({
          name: `RigidBody${report.rigid_bodies.length + 1}`,
          selections
        })
      }
      const legacyRigidMatch = line.match(LEGACY_SHAPE_RIGID)
      const segments = legacyRigidMatch
        ? legacySegmentsOf(legacyRigidMatch[1] as string)
        : []
      if (segments.length > 0) {
        legacyRigid.push({
          name: `RigidBody${legacyRigid.length + 1}`,
          segments
        })
      }
      continue
    }

    report.skipped.push(line)
  }

  return {
    report,
    legacy: { fixed_bodies: legacyFixed, rigid_bodies: legacyRigid }
  }
}

/**
 * Reads the fixed and rigid bodies from a CHARMM const.inp file, keeping each
 * selection's segid, and reports the commands it could not read. Besides the
 * `resid a:b .and. segid S` defines the Inp Jiffy writes, it reads single
 * residues (`resid 5`), whole segments (`segid HETA`), several segids
 * (`resid 1:20 .and. ( segid PROA .or. segid PROB )`, `segid CARB .or. segid
 * CARC`) and the 4-letter keyword abbreviations, in any case.
 *
 * CHARMM runs the file top to bottom: a 'define' may reuse an earlier name, and
 * each 'cons fix' / 'shape desc' uses the definitions current at that line. So
 * this parses in a single pass instead of collecting every define first.
 * Bodies are named FixedBody1…, RigidBody1… in file order.
 */
export const readConstInp = (inpContent: string): ConstInpReport =>
  scanConstInp(inpContent).report

/**
 * Reads the fixed and rigid bodies from a CHARMM const.inp file, in the
 * structured form the worker stores as `md_constraints` and turns into OpenMM
 * constraints. It reads only `define … sele ( resid a:b .and. segid S ) end`;
 * other selections are left out. `readConstInp` reads more, for the Inp Jiffy.
 */
export const parseConstInp = (inpContent: string): MDConstraintsDTO =>
  scanConstInp(inpContent).legacy
