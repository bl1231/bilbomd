import { describe, it, expect } from 'vitest'
import { parseAlphaFoldEntities } from '../parseAlphaFoldEntities.js'

describe('parseAlphaFoldEntities', () => {
  describe('entities_json path', () => {
    it('parses a JSON string and returns entities as-is', () => {
      const entities = [
        { name: 'chainA', sequence: 'ACGT', type: 'protein', copies: 1 }
      ]
      const result = parseAlphaFoldEntities({
        entities_json: JSON.stringify(entities)
      })
      expect(result).toEqual(entities)
    })

    it('handles multiple entities in JSON string', () => {
      const entities = [
        { name: 'A', sequence: 'MAAV', type: 'protein', copies: 2 },
        { name: 'B', sequence: 'GCGC', type: 'dna', copies: 1 }
      ]
      const result = parseAlphaFoldEntities({
        entities_json: JSON.stringify(entities)
      })
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('A')
    })
  })

  describe('entities array path', () => {
    it('maps array entities with copies parsed as integer', () => {
      const result = parseAlphaFoldEntities({
        entities: [
          {
            name: 'chainA',
            sequence: 'MAAV',
            type: 'protein',
            copies: '3' as unknown as number
          }
        ]
      })
      expect(result[0].copies).toBe(3)
      expect(typeof result[0].copies).toBe('number')
    })

    it('preserves other entity fields when mapping', () => {
      const result = parseAlphaFoldEntities({
        entities: [
          { name: 'chainB', sequence: 'GCGC', type: 'rna', copies: 1 }
        ]
      })
      expect(result[0].name).toBe('chainB')
      expect(result[0].sequence).toBe('GCGC')
      expect(result[0].type).toBe('rna')
    })
  })

  describe('bracket notation path', () => {
    it('extracts a single entity from bracket keys', () => {
      const result = parseAlphaFoldEntities({
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'protein',
        'entities[0][copies]': '2'
      })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('chainA')
      expect(result[0].sequence).toBe('MAAV')
      expect(result[0].type).toBe('protein')
      expect(result[0].copies).toBe(2)
    })

    it('extracts multiple entities sorted by index', () => {
      const result = parseAlphaFoldEntities({
        'entities[1][name]': 'chainB',
        'entities[1][sequence]': 'GCGC',
        'entities[1][type]': 'dna',
        'entities[1][copies]': '1',
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'protein',
        'entities[0][copies]': '3'
      })
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('chainA')
      expect(result[1].name).toBe('chainB')
    })

    it('defaults copies to 1 when copies key is absent', () => {
      const result = parseAlphaFoldEntities({
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'protein'
      })
      expect(result[0].copies).toBe(1)
    })
  })
})
