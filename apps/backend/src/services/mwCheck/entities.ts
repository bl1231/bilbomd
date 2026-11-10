import type { MwCheckEntity } from '@bilbomd/bilbomd-types'

// Bounds on what the unauthenticated mass check will accept. Generous next
// to any real job: the largest sequence-based job is a few thousand residues.
export const MAX_ENTITIES = 50
export const MAX_SEQUENCE_LENGTH = 20_000
export const MAX_TOTAL_RESIDUES = 100_000
export const MAX_COPIES = 100

const ENTITY_TYPES = ['Protein', 'DNA', 'RNA'] as const

type ParsedEntities =
  { ok: true; entities: MwCheckEntity[] } | { ok: false; message: string }

const isEntityType = (value: unknown): value is MwCheckEntity['type'] =>
  ENTITY_TYPES.includes(value as MwCheckEntity['type'])

// Reads the `entities` form field: a JSON list of {type, sequence, copies}.
// Only letters survive into the sequence, so nothing else reaches the script.
export const parseEntities = (raw: unknown): ParsedEntities => {
  let parsed: unknown
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return { ok: false, message: 'entities must be valid JSON.' }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, message: 'entities must be a non-empty list.' }
  }
  if (parsed.length > MAX_ENTITIES) {
    return { ok: false, message: `At most ${MAX_ENTITIES} entities.` }
  }

  const entities: MwCheckEntity[] = []
  let total = 0
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, message: 'Each entity must be an object.' }
    }
    const { type, sequence, copies = 1 } = item as Record<string, unknown>
    if (!isEntityType(type)) {
      return {
        ok: false,
        message: `Entity type must be one of: ${ENTITY_TYPES.join(', ')}.`
      }
    }
    if (typeof sequence !== 'string') {
      return { ok: false, message: 'Each entity needs a sequence.' }
    }
    const letters = sequence.replace(/\s+/g, '').toUpperCase()
    if (!/^[A-Z]+$/.test(letters)) {
      return { ok: false, message: 'Sequences may only contain letters.' }
    }
    if (letters.length > MAX_SEQUENCE_LENGTH) {
      return {
        ok: false,
        message: `A sequence may be at most ${MAX_SEQUENCE_LENGTH} residues.`
      }
    }
    const count = Number(copies)
    if (!Number.isInteger(count) || count < 1 || count > MAX_COPIES) {
      return {
        ok: false,
        message: `Copies must be a whole number from 1 to ${MAX_COPIES}.`
      }
    }
    total += letters.length * count
    if (total > MAX_TOTAL_RESIDUES) {
      return {
        ok: false,
        message: `At most ${MAX_TOTAL_RESIDUES} residues in total.`
      }
    }
    entities.push({ type, sequence: letters, copies: count })
  }
  return { ok: true, entities }
}
