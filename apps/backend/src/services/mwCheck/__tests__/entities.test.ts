import { describe, it, expect } from 'vitest'
import {
  MAX_COPIES,
  MAX_ENTITIES,
  MAX_SEQUENCE_LENGTH,
  MAX_TOTAL_RESIDUES,
  parseEntities
} from '../entities.js'

const ok = (raw: unknown) => {
  const result = parseEntities(raw)
  if (!result.ok) throw new Error(result.message)
  return result.entities
}

const message = (raw: unknown) => {
  const result = parseEntities(raw)
  return result.ok ? undefined : result.message
}

describe('parseEntities', () => {
  it('reads the JSON the forms send and tidies the sequences', () => {
    expect(
      ok(
        JSON.stringify([
          {
            type: 'Protein',
            sequence: 'mkt ay\nIAK',
            copies: 2,
            name: 'pro-1'
          },
          { type: 'DNA', sequence: 'ACGT' }
        ])
      )
    ).toEqual([
      { type: 'Protein', sequence: 'MKTAYIAK', copies: 2 },
      { type: 'DNA', sequence: 'ACGT', copies: 1 }
    ])
  })

  it('accepts an already-parsed list and numeric strings for copies', () => {
    expect(ok([{ type: 'RNA', sequence: 'ACGU', copies: '3' }])).toEqual([
      { type: 'RNA', sequence: 'ACGU', copies: 3 }
    ])
  })

  it.each([
    ['not json', '{nope'],
    ['not a list', '{"type":"Protein"}'],
    ['an empty list', '[]'],
    ['a non-object entry', '["MKT"]'],
    ['an unknown type', '[{"type":"Lipid","sequence":"AAA"}]'],
    ['a missing sequence', '[{"type":"Protein"}]'],
    ['an empty sequence', '[{"type":"Protein","sequence":"  "}]'],
    ['zero copies', '[{"type":"Protein","sequence":"MKT","copies":0}]'],
    ['fractional copies', '[{"type":"Protein","sequence":"MKT","copies":1.5}]']
  ])('rejects %s', (_name, raw) => {
    expect(message(raw)).toBeDefined()
  })

  it.each([
    'MKT; rm -rf /',
    'MKT$(whoami)',
    '../../etc/passwd',
    'MK1',
    'MKT-AAA'
  ])('rejects a sequence with anything but letters: %s', (sequence) => {
    expect(message([{ type: 'Protein', sequence }])).toBe(
      'Sequences may only contain letters.'
    )
  })

  it('bounds the amount of work a request can ask for', () => {
    const entity = { type: 'Protein', sequence: 'A' }
    expect(message(Array(MAX_ENTITIES + 1).fill(entity))).toMatch(/At most/)
    expect(
      message([
        { type: 'Protein', sequence: 'A'.repeat(MAX_SEQUENCE_LENGTH + 1) }
      ])
    ).toMatch(/at most/)
    expect(message([{ ...entity, copies: MAX_COPIES + 1 }])).toMatch(/Copies/)
    expect(
      message([
        {
          type: 'Protein',
          sequence: 'A'.repeat(MAX_SEQUENCE_LENGTH),
          copies: Math.ceil(MAX_TOTAL_RESIDUES / MAX_SEQUENCE_LENGTH) + 1
        }
      ])
    ).toMatch(/in total/)
    expect(ok(Array(MAX_ENTITIES).fill(entity))).toHaveLength(MAX_ENTITIES)
  })
})
