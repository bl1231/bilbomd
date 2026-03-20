import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseFileContent,
  extractChiSquared,
  extractC1C2,
  extractScoperC1C2,
  readTopKNum
} from '../foxsParser.js'

vi.mock('fs-extra')

describe('parseFileContent', () => {
  it('parses valid dat file lines into FoxsDataPoint array', () => {
    const content = `# comment line
# Chi^2 = 1.23
0.001 100.0 98.5 2.0
0.002 80.0 79.2 1.5
0.003 60.0 61.0 1.2`
    const result = parseFileContent(content)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      q: 0.001,
      exp_intensity: 100.0,
      model_intensity: 98.5,
      error: 2.0
    })
    expect(result[2].q).toBeCloseTo(0.003)
  })

  it('skips comment lines starting with #', () => {
    const content = `# this is a comment
0.001 100.0 98.5 2.0`
    const result = parseFileContent(content)
    expect(result).toHaveLength(1)
  })

  it('skips lines with fewer than 4 columns', () => {
    const content = `0.001 100.0 98.5
0.002 80.0 79.2 1.5`
    const result = parseFileContent(content)
    expect(result).toHaveLength(1)
    expect(result[0].q).toBeCloseTo(0.002)
  })

  it('returns empty array for empty input', () => {
    expect(parseFileContent('')).toEqual([])
    expect(parseFileContent('   \n\n  ')).toEqual([])
  })

  it('defaults error to 1 when non-positive', () => {
    const content = `0.001 100.0 98.5 0`
    const result = parseFileContent(content)
    expect(result[0].error).toBe(1)
  })

  it('defaults non-finite numbers to 0', () => {
    const content = `NaN foo bar 1.5`
    const result = parseFileContent(content)
    expect(result[0].q).toBe(0)
    expect(result[0].exp_intensity).toBe(0)
    expect(result[0].model_intensity).toBe(0)
  })
})

describe('extractChiSquared', () => {
  it('extracts chi-squared value from second line', () => {
    const content = `# first line ignored
# Chi^2 = 3.14
0.001 100 99 2`
    expect(extractChiSquared(content)).toBeCloseTo(3.14)
  })

  it('returns 0.0 when no Chi^2 pattern found', () => {
    const content = `# line1
# no chi here`
    expect(extractChiSquared(content)).toBe(0.0)
  })

  it('returns 0.0 for single-line content', () => {
    expect(extractChiSquared('only one line')).toBe(0.0)
  })

  it('returns 0.0 for empty content', () => {
    expect(extractChiSquared('')).toBe(0.0)
  })
})

describe('extractC1C2', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('extracts c1 and c2 from log file content', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockResolvedValue(
      'some text c1 = 1.050 c2 = 0.023 more text' as never
    )
    const result = await extractC1C2('/fake/log.log')
    expect(result.c1).toBe('1.05')
    expect(result.c2).toBe('0.02')
  })

  it('throws when c1 or c2 not found', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockResolvedValue('no values here' as never)
    await expect(extractC1C2('/fake/log.log')).rejects.toThrow(
      'Could not find c1 and c2 values'
    )
  })
})

describe('extractScoperC1C2', () => {
  it('extracts separate c1/c2 for original and scoper lines', () => {
    const content = [
      'original_pdb.pdb c1 = 1.05 c2 = 0.02',
      'scoper_combined_newpdb_3.pdb c1 = 1.02 c2 = -0.05'
    ].join('\n')

    const result = extractScoperC1C2(content)
    expect(result.c1FromOrig).toBeCloseTo(1.05)
    expect(result.c2FromOrig).toBeCloseTo(0.02)
    expect(result.c1FromScop).toBeCloseTo(1.02)
    expect(result.c2FromScop).toBeCloseTo(-0.05)
  })

  it('returns null for missing scoper line', () => {
    const content = 'original.pdb c1 = 1.05 c2 = 0.02'
    const result = extractScoperC1C2(content)
    expect(result.c1FromOrig).toBeCloseTo(1.05)
    expect(result.c1FromScop).toBeNull()
    expect(result.c2FromScop).toBeNull()
  })

  it('returns all nulls for empty content', () => {
    const result = extractScoperC1C2('')
    expect(result.c1FromOrig).toBeNull()
    expect(result.c1FromScop).toBeNull()
    expect(result.c2FromOrig).toBeNull()
    expect(result.c2FromScop).toBeNull()
  })
})

describe('readTopKNum', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('extracts the pdb number from file content', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockResolvedValue('newpdb_7\n' as never)
    const result = await readTopKNum('/fake/top_k_dirname.txt')
    expect(result).toBe(7)
  })

  it('returns null when no match found', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockResolvedValue('no_match_here\n' as never)
    const result = await readTopKNum('/fake/top_k_dirname.txt')
    expect(result).toBeNull()
  })

  it('throws when file cannot be read', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT') as never)
    await expect(readTopKNum('/fake/missing.txt')).rejects.toThrow(
      'Could not determine top K PDB number'
    )
  })
})
