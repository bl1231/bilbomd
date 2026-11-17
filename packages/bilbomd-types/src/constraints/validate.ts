import { closeBodiesMessage } from '../constraintGaps.js'
import { MAX_CONST_INP_SHAPE_COMMANDS } from '../structureFileChecks.js'
import type {
  ConstraintBody,
  ConstraintError,
  ConstraintSegment,
  ConstraintStructure,
  Constraints,
  ConstraintsValidation,
  StructureSegment
} from './types.js'

/** Most rigid bodies: CHARMM's MAXSHP limit on shape descriptors */
export const MAX_RIGID_BODIES = MAX_CONST_INP_SHAPE_COMMANDS
export const MAX_SEGMENTS_PER_BODY = 50
export const MAX_CONSTRAINT_SEGMENTS = 200
/** Longest `constraints` field, in characters */
export const MAX_CONSTRAINTS_JSON_LENGTH = 64 * 1024
export const MAX_RESIDUE_NUMBER = 99999

/** A CHARMM segid as written to const.inp: CHARMM reads them uppercase */
export const SEGID_PATTERN = /^[A-Z0-9]{1,4}$/
/** A PDB chain ID: one character */
export const PDB_CHAIN_ID_PATTERN = /^[A-Za-z0-9]$/

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const unknownKeys = (value: Json, allowed: readonly string[]): string[] =>
  Object.keys(value).filter((key) => !allowed.includes(key))

/**
 * Parses the `constraints` form field. Returns the raw value for
 * `validateConstraintsInput`, or why it can't be read.
 */
export const parseConstraintsJson = (
  text: unknown
): { ok: true; value: unknown } | { ok: false; errors: ConstraintError[] } => {
  const fail = (message: string) => ({
    ok: false as const,
    errors: [{ path: 'constraints', message }]
  })
  if (typeof text !== 'string' || text.trim() === '') {
    return fail('Constraints are required, as JSON in the "constraints" field.')
  }
  if (text.length > MAX_CONSTRAINTS_JSON_LENGTH) {
    return fail(
      `Constraints are larger than ${MAX_CONSTRAINTS_JSON_LENGTH} characters.`
    )
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return fail('Constraints are not valid JSON.')
  }
}

interface Range {
  start: number
  stop: number
}

const readRange = (
  value: unknown,
  path: string,
  errors: ConstraintError[]
): Range | null => {
  if (!isObject(value)) {
    errors.push({ path, message: 'residues must be { "start": n, "stop": n }' })
    return null
  }
  const extra = unknownKeys(value, ['start', 'stop'])
  if (extra.length > 0) {
    errors.push({ path, message: `Unknown field(s): ${extra.join(', ')}` })
    return null
  }
  const { start, stop } = value
  const isResidue = (n: unknown): n is number =>
    Number.isInteger(n) &&
    (n as number) >= 0 &&
    (n as number) <= MAX_RESIDUE_NUMBER
  if (!isResidue(start) || !isResidue(stop)) {
    errors.push({
      path,
      message: `start and stop must be whole numbers from 0 to ${MAX_RESIDUE_NUMBER}`
    })
    return null
  }
  if (start > stop) {
    errors.push({ path, message: `start (${start}) is after stop (${stop})` })
    return null
  }
  return { start, stop }
}

// The structure segment a constraint segment refers to, or why it can't
const findStructureSegment = (
  segment: Json,
  structure: ConstraintStructure,
  path: string,
  errors: ConstraintError[]
): StructureSegment | null => {
  const { chain_id: chainId, segid } = segment
  if (
    segid !== undefined &&
    (typeof segid !== 'string' || !SEGID_PATTERN.test(segid))
  ) {
    errors.push({
      path: `${path}.segid`,
      message: 'segid must be 1-4 uppercase letters or digits'
    })
    return null
  }

  if (structure.mode === 'crd_psf') {
    if (segid === undefined) {
      errors.push({
        path: `${path}.segid`,
        message: 'segid is required for CRD/PSF jobs'
      })
      return null
    }
    if (chainId !== undefined && chainId !== segid) {
      errors.push({
        path: `${path}.chain_id`,
        message:
          'For CRD/PSF jobs, leave out chain_id (segments are named by segid)'
      })
      return null
    }
    const found = structure.segments.find((s) => s.segid === segid)
    if (!found) {
      errors.push({
        path: `${path}.segid`,
        message: `Segment ${segid} is not in the PSF file`
      })
    }
    return found ?? null
  }

  if (typeof chainId !== 'string' || !PDB_CHAIN_ID_PATTERN.test(chainId)) {
    errors.push({
      path: `${path}.chain_id`,
      message: 'chain_id must be one PDB chain ID (a letter or digit)'
    })
    return null
  }
  const found = structure.segments.find((s) => s.chain_id === chainId)
  if (!found) {
    errors.push({
      path: `${path}.chain_id`,
      message: `Chain ${chainId} is not in the structure (or has no protein, DNA, RNA or carbohydrate residues)`
    })
    return null
  }
  if (segid !== undefined && segid !== found.segid) {
    errors.push({
      path: `${path}.segid`,
      message: `Chain ${chainId} is segment ${found.segid}, not ${String(segid)}`
    })
    return null
  }
  return found
}

const readSegment = (
  value: unknown,
  structure: ConstraintStructure,
  path: string,
  errors: ConstraintError[]
): ConstraintSegment | null => {
  if (!isObject(value)) {
    errors.push({ path, message: 'Each segment must be an object' })
    return null
  }
  const extra = unknownKeys(value, ['chain_id', 'segid', 'residues'])
  if (extra.length > 0) {
    errors.push({ path, message: `Unknown field(s): ${extra.join(', ')}` })
    return null
  }
  const target = findStructureSegment(value, structure, path, errors)
  const range =
    value.residues === undefined
      ? null
      : readRange(value.residues, `${path}.residues`, errors)
  if (!target || (value.residues !== undefined && !range)) return null

  const first = target.residues[0]
  const last = target.residues[target.residues.length - 1]
  if (first === undefined || last === undefined) {
    errors.push({ path, message: `Segment ${target.segid} has no residues` })
    return null
  }
  if (!range) {
    // The whole segment is written as its full range for OpenMM, so that
    // range must be one a residue range may be
    if (first < 0 || last > MAX_RESIDUE_NUMBER) {
      errors.push({
        path,
        message: `Segment ${target.segid} has residues ${first}-${last}, outside 0-${MAX_RESIDUE_NUMBER}. Give a residue range instead of the whole segment.`
      })
      return null
    }
    return {
      chain_id: target.chain_id,
      segid: target.segid,
      residues: { start: first, stop: last },
      whole_segment: true
    }
  }
  if (!target.residues.some((r) => r >= range.start && r <= range.stop)) {
    errors.push({
      path: `${path}.residues`,
      message: `Segment ${target.segid} has no residues in ${range.start}-${range.stop} (it has ${first}-${last})`
    })
    return null
  }
  return { chain_id: target.chain_id, segid: target.segid, residues: range }
}

const readBodies = (
  value: unknown,
  kind: 'fixed_bodies' | 'rigid_bodies',
  structure: ConstraintStructure,
  errors: ConstraintError[]
): ConstraintBody[] => {
  if (!Array.isArray(value)) {
    errors.push({ path: kind, message: `${kind} must be a list` })
    return []
  }
  return value.flatMap((body: unknown, i) => {
    const path = `${kind}[${i}]`
    if (!isObject(body)) {
      errors.push({ path, message: 'Each body must be an object' })
      return []
    }
    const extra = unknownKeys(body, ['segments'])
    if (extra.length > 0) {
      errors.push({ path, message: `Unknown field(s): ${extra.join(', ')}` })
      return []
    }
    const { segments } = body
    if (!Array.isArray(segments) || segments.length === 0) {
      errors.push({
        path: `${path}.segments`,
        message: 'Each body needs at least one segment'
      })
      return []
    }
    if (segments.length > MAX_SEGMENTS_PER_BODY) {
      errors.push({
        path: `${path}.segments`,
        message: `A body can have at most ${MAX_SEGMENTS_PER_BODY} segments`
      })
      return []
    }
    const read = segments.map((s: unknown, j) =>
      readSegment(s, structure, `${path}.segments[${j}]`, errors)
    )
    if (read.some((s) => s === null)) return []
    const name =
      kind === 'fixed_bodies' ? `FixedBody${i + 1}` : `RigidBody${i + 1}`
    return [{ name, segments: read as ConstraintSegment[] }]
  })
}

// Every place two bodies share residues on a segment. A residue in two rigid
// bodies breaks OpenMM ("Virtual site has nonzero mass"); one in a fixed and a
// rigid body would be both held and moved.
const findOverlaps = (constraints: Constraints): string[] => {
  const overlaps: string[] = []
  const bodies = [...constraints.fixed_bodies, ...constraints.rigid_bodies]
  bodies.forEach((a, i) => {
    bodies.slice(i + 1).forEach((b) => {
      for (const sa of a.segments) {
        for (const sb of b.segments) {
          if (sa.segid !== sb.segid) continue
          const start = Math.max(sa.residues.start, sb.residues.start)
          const stop = Math.min(sa.residues.stop, sb.residues.stop)
          if (start <= stop) {
            overlaps.push(
              `${a.name} and ${b.name} both include segment ${sa.segid} residues ${start}-${stop}`
            )
          }
        }
      }
    })
  })
  return overlaps
}

// Segids that more than one chain would get, e.g. protein chains A and a
const segidCollisions = (structure: ConstraintStructure): string[] => {
  const chainsBySegid = new Map<string, string[]>()
  for (const s of structure.segments) {
    chainsBySegid.set(s.segid, [
      ...(chainsBySegid.get(s.segid) ?? []),
      s.chain_id
    ])
  }
  return [...chainsBySegid.entries()]
    .filter(([, chains]) => chains.length > 1)
    .map(
      ([segid, chains]) =>
        `Chains ${chains.join(' and ')} would both be CHARMM segment ${segid}, ` +
        'since CHARMM ignores case. Rename one of the chains.'
    )
}

/**
 * Checks constraints sent with a job against its uploaded structure, and
 * returns them in the form stored as md_constraints: bodies named by the
 * server, each segment with its segid and a residue range. Rules:
 * - exactly one fixed body and at most MAX_RIGID_BODIES rigid bodies
 * - segments name a chain (PDB jobs) or segid (CRD/PSF jobs) in the structure,
 *   with whole-number residue ranges that include residues the segment has
 * - no residue in two bodies
 * - no fields other than the documented ones
 * Bodies with too few flexible residues between them only give warnings.
 */
export const validateConstraintsInput = (
  raw: unknown,
  structure: ConstraintStructure
): ConstraintsValidation => {
  const errors: ConstraintError[] = segidCollisions(structure).map(
    (message) => ({ path: 'structure', message })
  )

  if (!isObject(raw)) {
    return {
      ok: false,
      errors: [
        ...errors,
        { path: 'constraints', message: 'Constraints must be a JSON object' }
      ]
    }
  }
  const extra = unknownKeys(raw, ['fixed_bodies', 'rigid_bodies'])
  if (extra.length > 0) {
    errors.push({
      path: 'constraints',
      message: `Unknown field(s): ${extra.join(', ')}`
    })
  }

  const fixed = readBodies(raw.fixed_bodies, 'fixed_bodies', structure, errors)
  if (Array.isArray(raw.fixed_bodies) && raw.fixed_bodies.length !== 1) {
    errors.push({
      path: 'fixed_bodies',
      message: 'Give exactly one fixed body (the part held in place)'
    })
  }
  const rigid =
    raw.rigid_bodies === undefined
      ? []
      : readBodies(raw.rigid_bodies, 'rigid_bodies', structure, errors)
  if (
    Array.isArray(raw.rigid_bodies) &&
    raw.rigid_bodies.length > MAX_RIGID_BODIES
  ) {
    errors.push({
      path: 'rigid_bodies',
      message: `At most ${MAX_RIGID_BODIES} rigid bodies are allowed`
    })
  }

  const constraints: Constraints = { fixed_bodies: fixed, rigid_bodies: rigid }
  const total = [...fixed, ...rigid].reduce((n, b) => n + b.segments.length, 0)
  if (total > MAX_CONSTRAINT_SEGMENTS) {
    errors.push({
      path: 'constraints',
      message: `At most ${MAX_CONSTRAINT_SEGMENTS} segments are allowed in all`
    })
  }
  if (errors.length > 0) return { ok: false, errors }

  const overlaps = findOverlaps(constraints)
  if (overlaps.length > 0) {
    return {
      ok: false,
      errors: overlaps.map((message) => ({ path: 'constraints', message }))
    }
  }

  const close = closeBodiesMessage(constraints)
  return { ok: true, constraints, warnings: close ? [close] : [] }
}
