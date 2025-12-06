/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseStateLine,
  isStateLine,
  parseEnsembleFile,
  assembleEnsemblePdbFiles,
  concatenateAndSaveAsEnsemble
} from '../assemble-ensemble-pdb-file.js'

// Mock dependencies
vi.mock('fs-extra', () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    pathExists: vi.fn()
  }
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    uploadDir: '/mock/upload/dir'
  }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Import the mocked fs after mocking
import fs from 'fs-extra'

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

  describe('concatenateAndSaveAsEnsemble', () => {
    const mockFs = vi.mocked(fs)

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should concatenate PDB files and save as ensemble', async () => {
      const pdbFiles = ['/path/to/file1.pdb', '/path/to/file2.pdb']
      const ensembleSize = 2
      const resultsDir = '/results'

      // Mock file contents
      ;(mockFs.readFile as any)
        .mockResolvedValueOnce(
          'ATOM  1  N   ALA A   1      20.154  16.967  23.466  1.00 20.00           N\nEND'
        )
        .mockResolvedValueOnce(
          'ATOM  1  N   GLY A   1      18.324  15.432  22.123  1.00 18.50           N\nEND'
        )
      ;(mockFs.writeFile as any).mockResolvedValue(undefined)

      await concatenateAndSaveAsEnsemble(pdbFiles, ensembleSize, resultsDir)

      expect(mockFs.readFile).toHaveBeenCalledTimes(2)
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/results/ensemble_size_2_model.pdb',
        expect.stringContaining('MODEL       1')
      )
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/results/ensemble_size_2_model.pdb',
        expect.stringContaining('MODEL       2')
      )
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/results/ensemble_size_2_model.pdb',
        expect.stringContaining('ENDMDL')
      )
    })

    it('should handle file read errors', async () => {
      const pdbFiles = ['/path/to/missing.pdb']
      const ensembleSize = 1
      const resultsDir = '/results'

      ;(mockFs.readFile as any).mockRejectedValue(new Error('File not found'))

      await expect(
        concatenateAndSaveAsEnsemble(pdbFiles, ensembleSize, resultsDir)
      ).rejects.toThrow('File not found')

      expect(mockFs.writeFile).not.toHaveBeenCalled()
    })

    it('should replace END with ENDMDL in PDB content', async () => {
      const pdbFiles = ['/path/to/file1.pdb']
      const ensembleSize = 1
      const resultsDir = '/results'

      ;(mockFs.readFile as any).mockResolvedValue(
        'ATOM line 1\nATOM line 2\nEND'
      )
      ;(mockFs.writeFile as any).mockResolvedValue(undefined)

      await concatenateAndSaveAsEnsemble(pdbFiles, ensembleSize, resultsDir)

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/results/ensemble_size_1_model.pdb',
        expect.stringMatching(/ENDMDL/)
      )
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/results/ensemble_size_1_model.pdb',
        expect.not.stringMatching(/\bEND\n?$/)
      )
    })
  })

  describe('assembleEnsemblePdbFiles', () => {
    const mockFs = vi.mocked(fs)
    let mockJob: any

    beforeEach(() => {
      vi.clearAllMocks()

      mockJob = {
        uuid: 'test-uuid-123',
        results: {},
        save: vi.fn().mockResolvedValue(undefined)
      }

      // Reset all mock implementations
      ;(mockFs.readdir as any).mockReset()
      ;(mockFs.readFile as any).mockReset()
      ;(mockFs.writeFile as any).mockReset()
      ;(mockFs.pathExists as any).mockReset()
    })

    it('should process ensemble files and update job results', async () => {
      // Mock directory listing
      ;(mockFs.readdir as any).mockResolvedValue([
        'ensembles_size_1.txt',
        'ensembles_size_2.txt',
        'other_file.txt'
      ])

      // Mock ensemble file contents
      const ensembleContent1 = `1 |  2.98 | x1 2.98 (1.05, -0.50)
        1   | 0.290 (0.290, 1.000) | ../foxs/run1/file1.pdb.dat (0.125)`
      const ensembleContent2 = `1 |  3.15 | x1 3.15 (1.10, -0.45)
        1   | 0.350 (0.350, 0.900) | ../foxs/run1/file2.pdb.dat (0.200)`

      ;(mockFs.readFile as any)
        .mockResolvedValueOnce(ensembleContent1)
        .mockResolvedValueOnce(ensembleContent2)

      // Mock PDB file existence and content
      ;(mockFs.pathExists as any).mockResolvedValue(true)
      ;(mockFs.readFile as any)
        .mockResolvedValueOnce('PDB content 1\nEND')
        .mockResolvedValueOnce('PDB content 2\nEND')
      ;(mockFs.writeFile as any).mockResolvedValue(undefined)

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      expect(mockFs.readdir).toHaveBeenCalledWith(
        '/mock/upload/dir/test-uuid-123/multifoxs'
      )
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/mock/upload/dir/test-uuid-123/multifoxs/ensembles_size_1.txt',
        'utf8'
      )
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/mock/upload/dir/test-uuid-123/multifoxs/ensembles_size_2.txt',
        'utf8'
      )

      expect(mockJob.results.classic).toBeDefined()
      expect(mockJob.results.classic.total_num_ensembles).toBe(2)
      expect(mockJob.results.classic.ensembles).toHaveLength(2)
      expect(mockJob.save).toHaveBeenCalled()
    })

    it('should handle missing PDB files gracefully', async () => {
      ;(mockFs.readdir as any).mockResolvedValue(['ensembles_size_1.txt'])

      const ensembleContent = `1 |  2.98 | x1 2.98 (1.05, -0.50)
        1   | 0.290 (0.290, 1.000) | ../foxs/run1/missing.pdb.dat (0.125)`

      ;(mockFs.readFile as any).mockResolvedValueOnce(ensembleContent)
      ;(mockFs.pathExists as any).mockResolvedValue(false) // PDB file doesn't exist

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      // Verify the ensemble was parsed correctly
      expect(mockJob.results.classic.ensembles).toHaveLength(1)
      expect(mockJob.results.classic.ensembles[0].models).toHaveLength(1)
      expect(
        mockJob.results.classic.ensembles[0].models[0].states
      ).toHaveLength(1)

      // pathExists should be called for each PDB file in the top model
      expect(mockFs.pathExists).toHaveBeenCalledWith(
        expect.stringContaining('missing.pdb')
      )
      expect(mockFs.writeFile).not.toHaveBeenCalled() // No ensemble file should be created
      expect(mockJob.save).toHaveBeenCalled()
    })

    it('should handle no ensemble files found', async () => {
      ;(mockFs.readdir as any).mockResolvedValue(['other_file.txt'])

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      expect(mockJob.results.classic.total_num_ensembles).toBe(0)
      expect(mockJob.results.classic.ensembles).toHaveLength(0)
      expect(mockJob.save).toHaveBeenCalled()
    })

    it('should handle ensemble files with no models', async () => {
      ;(mockFs.readdir as any).mockResolvedValue(['ensembles_size_1.txt'])
      ;(mockFs.readFile as any).mockResolvedValueOnce('') // empty ensemble file

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      expect(mockJob.results.classic.ensembles).toHaveLength(1)
      expect(mockJob.results.classic.ensembles[0].models).toHaveLength(0)
      expect(mockJob.save).toHaveBeenCalled()
    })

    it('should sort ensemble sizes correctly', async () => {
      ;(mockFs.readdir as any).mockResolvedValue([
        'ensembles_size_3.txt',
        'ensembles_size_1.txt',
        'ensembles_size_2.txt'
      ])

      const ensembleContent = `1 |  2.98 | x1 2.98 (1.05, -0.50)`

      ;(mockFs.readFile as any)
        .mockResolvedValue(ensembleContent)
        .mockResolvedValue(ensembleContent)
        .mockResolvedValue(ensembleContent)

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      expect(mockJob.results.classic.ensembles[0].size).toBe(1)
      expect(mockJob.results.classic.ensembles[1].size).toBe(2)
      expect(mockJob.results.classic.ensembles[2].size).toBe(3)
    })

    it('should resolve PDB paths correctly from multifoxs directory', async () => {
      ;(mockFs.readdir as any).mockResolvedValue(['ensembles_size_1.txt'])

      const ensembleContent = `1 |  2.98 | x1 2.98 (1.05, -0.50)
        1   | 0.290 (0.290, 1.000) | ../foxs/run1/file.pdb.dat (0.125)`

      ;(mockFs.readFile as any).mockResolvedValueOnce(ensembleContent)
      ;(mockFs.pathExists as any).mockResolvedValue(true)
      ;(mockFs.readFile as any).mockResolvedValueOnce('PDB content\nEND')
      ;(mockFs.writeFile as any).mockResolvedValue(undefined)

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      // Verify that pathExists was called with the resolved path
      expect(mockFs.pathExists).toHaveBeenCalledWith(
        expect.stringContaining('test-uuid-123')
      )
      expect(mockFs.pathExists).toHaveBeenCalledWith(
        expect.stringContaining('foxs/run1/file.pdb')
      )
    })

    it('should handle partial PDB file availability', async () => {
      ;(mockFs.readdir as any).mockResolvedValue(['ensembles_size_1.txt'])

      const ensembleContent = `1 |  2.98 | x1 2.98 (1.05, -0.50)
        1   | 0.290 (0.290, 1.000) | ../foxs/run1/file1.pdb.dat (0.125)
        2   | 0.410 (0.410, 0.800) | ../foxs/run1/file2.pdb.dat (0.300)`

      ;(mockFs.readFile as any).mockResolvedValueOnce(ensembleContent)
      ;(mockFs.pathExists as any)
        .mockResolvedValueOnce(true) // file1 exists
        .mockResolvedValueOnce(false) // file2 doesn't exist
      ;(mockFs.readFile as any).mockResolvedValueOnce('PDB content\nEND')
      ;(mockFs.writeFile as any).mockResolvedValue(undefined)

      await assembleEnsemblePdbFiles({ DBjob: mockJob })

      expect(mockFs.pathExists).toHaveBeenCalledTimes(2)
      expect(mockFs.writeFile).toHaveBeenCalled() // Should still create ensemble with available files
    })

    it('should initialize results object if not present', async () => {
      const jobWithoutResults: any = {
        uuid: 'test-uuid-123',
        save: vi.fn().mockResolvedValue(undefined)
      }

      ;(mockFs.readdir as any).mockResolvedValue([])

      await assembleEnsemblePdbFiles({ DBjob: jobWithoutResults })

      expect(jobWithoutResults.results).toBeDefined()
      expect(jobWithoutResults.results.classic).toBeDefined()
    })
  })
})
