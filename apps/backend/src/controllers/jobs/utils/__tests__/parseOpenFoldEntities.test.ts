import { describe, it, expect } from 'vitest'
import { parseOpenFoldEntities } from '../parseOpenFoldEntities.js'

describe('parseOpenFoldEntities', () => {
  describe('entities_json path', () => {
    it('parses a JSON string and returns entities as-is', () => {
      const entities = [
        { name: 'chainA', sequence: 'ACGT', type: 'Protein', copies: 1 }
      ]
      const result = parseOpenFoldEntities({
        entities_json: JSON.stringify(entities)
      })
      expect(result).toEqual(entities)
    })

    it('handles multiple entities in JSON string', () => {
      const entities = [
        { name: 'A', sequence: 'MAAV', type: 'Protein', copies: 2 },
        { name: 'B', sequence: 'GCGC', type: 'DNA', copies: 1 }
      ]
      const result = parseOpenFoldEntities({
        entities_json: JSON.stringify(entities)
      })
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('A')
      expect(result[1].type).toBe('DNA')
    })
  })

  describe('entities array path', () => {
    it('maps array entities with copies parsed as integer', () => {
      const result = parseOpenFoldEntities({
        entities: [
          {
            name: 'chainA',
            sequence: 'MAAV',
            type: 'Protein',
            copies: '3' as unknown as number
          }
        ]
      })
      expect(result[0].copies).toBe(3)
      expect(typeof result[0].copies).toBe('number')
    })

    it('preserves other entity fields when mapping', () => {
      const result = parseOpenFoldEntities({
        entities: [
          { name: 'chainB', sequence: 'GCGC', type: 'RNA', copies: 1 }
        ]
      })
      expect(result[0].name).toBe('chainB')
      expect(result[0].sequence).toBe('GCGC')
      expect(result[0].type).toBe('RNA')
    })

    it('handles all three molecule types', () => {
      const result = parseOpenFoldEntities({
        entities: [
          { name: 'p', sequence: 'MAAV', type: 'Protein', copies: 1 },
          { name: 'd', sequence: 'ATCG', type: 'DNA', copies: 1 },
          { name: 'r', sequence: 'AUGC', type: 'RNA', copies: 1 }
        ]
      })
      expect(result.map((e) => e.type)).toEqual(['Protein', 'DNA', 'RNA'])
    })
  })

  describe('bracket notation path', () => {
    it('extracts a single entity from bracket keys', () => {
      const result = parseOpenFoldEntities({
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'Protein',
        'entities[0][copies]': '2'
      })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('chainA')
      expect(result[0].sequence).toBe('MAAV')
      expect(result[0].type).toBe('Protein')
      expect(result[0].copies).toBe(2)
    })

    it('extracts multiple entities sorted by index', () => {
      const result = parseOpenFoldEntities({
        'entities[1][name]': 'chainB',
        'entities[1][sequence]': 'GCGC',
        'entities[1][type]': 'DNA',
        'entities[1][copies]': '1',
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'Protein',
        'entities[0][copies]': '3'
      })
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('chainA')
      expect(result[1].name).toBe('chainB')
    })

    it('defaults copies to 1 when copies key is absent', () => {
      const result = parseOpenFoldEntities({
        'entities[0][name]': 'chainA',
        'entities[0][sequence]': 'MAAV',
        'entities[0][type]': 'Protein'
      })
      expect(result[0].copies).toBe(1)
    })
  })
})
