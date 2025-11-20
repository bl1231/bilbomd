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

  describe('Additional edge cases', () => {
    describe('isStateLine edge cases', () => {
      it('should handle different whitespace patterns', () => {
        expect(
          isStateLine('  1 | 0.290 (0.290, 1.000) | file.pdb.dat (0.125)')
        ).toBe(true)
        expect(isStateLine('\t\t1\t|\t0.290\t|\tfile.pdb.dat')).toBe(true)
        expect(isStateLine('1|weight|file.pdb.dat')).toBe(false) // no leading space
      })

      it('should return false for lines with .pdb.dat but wrong format', () => {
        expect(isStateLine('file.pdb.dat somewhere')).toBe(false)
        expect(isStateLine('| | file.pdb.dat')).toBe(false)
      })

      it('should return false for empty lines', () => {
        expect(isStateLine('')).toBe(false)
        expect(isStateLine('   ')).toBe(false)
      })
    })

    describe('parseStateLine edge cases', () => {
      it('should handle missing parentheses gracefully', () => {
        const line = '    1   | 0.290 | ../foxs/file.pdb.dat (0.125)'
        const result = parseStateLine(line)
        expect(result.weight).toBe(0.29)
        expect(result.weight_avg).toBe(0)
        expect(result.weight_stddev).toBe(0)
        expect(result.fraction).toBe(0.125)
      })

      it('should handle missing fraction gracefully', () => {
        const line = '    1   | 0.290 (0.290, 1.000) | ../foxs/file.pdb.dat'
        const result = parseStateLine(line)
        expect(result.weight).toBe(0.29)
        expect(result.weight_avg).toBe(0.29)
        expect(result.weight_stddev).toBe(1.0)
        expect(result.fraction).toBe(0)
      })

      it('should handle invalid numbers', () => {
        const line = '    1   | abc (def, ghi) | ../foxs/file.pdb.dat (jkl)'
        const result = parseStateLine(line)
        expect(result.weight).toBeNaN()
        expect(result.weight_avg).toBeNaN()
        expect(result.weight_stddev).toBeNaN()
        expect(result.fraction).toBeNaN()
      })

      it('should handle lines with fewer pipe separators', () => {
        const line = '    1   | 0.290'
        const result = parseStateLine(line)
        expect(result).toEqual({
          pdb: '',
          weight: 0,
          weight_avg: 0,
          weight_stddev: 0,
          fraction: 0
        })
      })

      it('should handle lines with no PDB file', () => {
        const line =
          '    1   | 0.290 (0.290, 1.000) | some other content (0.125)'
        const result = parseStateLine(line)
        expect(result.pdb).toBe('')
        expect(result.weight).toBe(0.29)
      })
    })

    describe('parseEnsembleFile complex scenarios', () => {
      it('should handle multiple models', () => {
        const content = `1 |  2.98 | x1 2.98 (1.05, -0.50)
          1   | 0.290 (0.290, 1.000) | file1.pdb.dat (0.125)
2 |  3.45 | x2 3.45 (1.20, -0.60)
          1   | 0.400 (0.400, 0.900) | file2.pdb.dat (0.200)`

        const result = parseEnsembleFile(content, 2)
        expect(result.models).toHaveLength(2)
        expect(result.models[0].rank).toBe(1)
        expect(result.models[0].chi2).toBe(2.98)
        expect(result.models[1].rank).toBe(2)
        expect(result.models[1].chi2).toBe(3.45)
      })

      it('should handle empty content', () => {
        const result = parseEnsembleFile('', 1)
        expect(result.models).toHaveLength(0)
        expect(result.size).toBe(1)
      })

      it('should handle model with no states', () => {
        const content = `1 |  2.98 | x1 2.98 (1.05, -0.50)
2 |  3.45 | x2 3.45 (1.20, -0.60)
          1   | 0.400 (0.400, 0.900) | file2.pdb.dat (0.200)`

        const result = parseEnsembleFile(content, 2)
        expect(result.models).toHaveLength(2)
        expect(result.models[0].states).toHaveLength(0)
        expect(result.models[1].states).toHaveLength(1)
      })

      it('should handle whitespace-only lines', () => {
        const content = `1 |  2.98 | x1 2.98 (1.05, -0.50)
          
          1   | 0.290 (0.290, 1.000) | file1.pdb.dat (0.125)
   
2 |  3.45 | x2 3.45 (1.20, -0.60)`

        const result = parseEnsembleFile(content, 2)
        expect(result.models).toHaveLength(2)
        expect(result.models[0].states).toHaveLength(1)
        expect(result.models[1].states).toHaveLength(0)
      })

      it('should handle malformed model summary lines', () => {
        const content = `malformed model line
1 |  2.98 | x1 2.98 (1.05, -0.50)
          1   | 0.290 (0.290, 1.000) | file1.pdb.dat (0.125)
invalid | model | line`

        const result = parseEnsembleFile(content, 1)
        expect(result.models).toHaveLength(1)
        expect(result.models[0].rank).toBe(1)
        expect(result.models[0].states).toHaveLength(1)
      })
    })

    describe('Real data format tests', () => {
      it('should parse actual ensemble file format with multiple states', () => {
        const actualContent = `1 |  2.98 | x1 2.98 (1.05, -0.50)
        1   | 0.290 (0.290, 1.000) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_60500.pdb.dat (0.125)
        3   | 0.470 (0.591, 0.121) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_24500.pdb.dat (1.000)
        5   | 0.240 (0.511, 0.419) | ../foxs/rg26_run1/dcd2pdb_rg26_run1_44500.pdb.dat (1.000)`

        const result = parseEnsembleFile(actualContent, 4)
        expect(result.size).toBe(4)
        expect(result.models).toHaveLength(1)
        expect(result.models[0].states).toHaveLength(3)
        expect(result.models[0].states[0].pdb).toContain('60500.pdb')
        expect(result.models[0].states[2].weight).toBeCloseTo(0.24)
      })

      it('should handle typical multifoxs output format', () => {
        const content = `1 |  1.85 | x1 1.85 (0.95, -0.40)
        2   | 0.150 (0.150, 0.850) | ../foxs/run1/file_001.pdb.dat (0.100)
        4   | 0.350 (0.275, 0.125) | ../foxs/run1/file_002.pdb.dat (0.500)
        7   | 0.500 (0.575, 0.025) | ../foxs/run1/file_003.pdb.dat (1.000)
2 |  2.15 | x2 2.15 (1.10, -0.35)
        1   | 0.200 (0.200, 0.800) | ../foxs/run2/file_001.pdb.dat (0.150)
        3   | 0.800 (0.800, 0.200) | ../foxs/run2/file_002.pdb.dat (0.850)`

        const result = parseEnsembleFile(content, 3)
        expect(result.size).toBe(3)
        expect(result.models).toHaveLength(2)
        expect(result.models[0].states).toHaveLength(3)
        expect(result.models[1].states).toHaveLength(2)
        expect(result.models[0].c1).toBeCloseTo(0.95)
        expect(result.models[0].c2).toBeCloseTo(-0.4)
        expect(result.models[1].c1).toBeCloseTo(1.1)
        expect(result.models[1].c2).toBeCloseTo(-0.35)
      })
    })
  })
})
