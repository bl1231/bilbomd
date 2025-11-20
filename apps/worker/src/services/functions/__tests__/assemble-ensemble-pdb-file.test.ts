import { describe, it, expect } from 'vitest'
import {
  parseStateLine,
  isStateLine,
  parseEnsembleFile
} from '../assemble-ensemble-pdb-file.js'

describe('assemble-ensemble-pdb-file', () => {
  describe('isStateLine', () => {
    it('should return true for valid state lines', () => {
      const line =
        '    1   | 0.290 (0.290, 1.000) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb.dat (0.125)'
      expect(isStateLine(line)).toBe(true)
    })

    it('should return false for invalid lines', () => {
      const line = '1 |  2.98 | x1 2.98 (1.05, -0.50)'
      expect(isStateLine(line)).toBe(false)
    })
  })

  describe('parseStateLine', () => {
    it('should correctly parse a valid state line', () => {
      const line =
        '    1   | 0.290 (0.290, 1.000) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb.dat (0.125)'
      const result = parseStateLine(line)
      expect(result).toEqual({
        pdb: '../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb',
        weight: 0.29,
        weight_avg: 0.29,
        weight_stddev: 1.0,
        fraction: 0.125
      })
    })

    it('should handle malformed lines gracefully', () => {
      const line = 'malformed line'
      const result = parseStateLine(line)
      expect(result).toEqual({
        pdb: '',
        weight: 0,
        weight_avg: 0,
        weight_stddev: 0,
        fraction: 0
      })
    })
  })

  describe('parseEnsembleFile', () => {
    it('should correctly parse an ensemble file', () => {
      const content = `1 |  2.98 | x1 2.98 (1.05, -0.50)
          1   | 0.290 (0.290, 1.000) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb.dat (0.125)
          3   | 0.470 (0.591, 0.121) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_24500.pdb.dat (1.000)`
      const result = parseEnsembleFile(content, 2)
      expect(result).toEqual({
        size: 2,
        models: [
          {
            rank: 1,
            chi2: 2.98,
            c1: 1.05,
            c2: -0.5,
            states: [
              {
                pdb: '../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb',
                weight: 0.29,
                weight_avg: 0.29,
                weight_stddev: 1.0,
                fraction: 0.125
              },
              {
                pdb: '../foxs/rg26_run1/dcd2pdb_rg26_run1_24500.pdb',
                weight: 0.47,
                weight_avg: 0.591,
                weight_stddev: 0.121,
                fraction: 1.0
              }
            ]
          }
        ]
      })
    })
  })
})
