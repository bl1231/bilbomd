import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Express } from 'express'
import {
  fromCharmmGui,
  isCRD,
  isPsfData,
  noSpaces,
  isSaxsData,
  containsChainId,
  checkPdbResidues,
  isRNA,
  isValidConstInpFile
} from '../validationFunctions.js'

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() }
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs/promises'

const mockFile = (): Express.Multer.File =>
  ({ path: '/fake/file' }) as Express.Multer.File

const mockReadFile = (content: string) => {
  vi.mocked(fs.readFile).mockResolvedValue(content as never)
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// fromCharmmGui
// ---------------------------------------------------------------------------
describe('fromCharmmGui', () => {
  it('returns true when "CHARMM-GUI" appears in first 5 lines', async () => {
    mockReadFile('* CHARMM-GUI generated\nline2\n')
    expect(await fromCharmmGui(mockFile())).toBe(true)
  })

  it('returns false when "CHARMM-GUI" is absent', async () => {
    mockReadFile('line1\nline2\nline3\n')
    expect(await fromCharmmGui(mockFile())).toBe(false)
  })

  it('returns false when "CHARMM-GUI" appears after line 5', async () => {
    mockReadFile('a\nb\nc\nd\ne\nCHARMM-GUI\n')
    expect(await fromCharmmGui(mockFile())).toBe(false)
  })

  it('returns false on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await fromCharmmGui(mockFile())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isCRD
// ---------------------------------------------------------------------------
describe('isCRD', () => {
  it('returns true for valid CRD format (2 star lines + EXT marker)', async () => {
    mockReadFile('* title\n* subtitle\n     12345 EXT\n')
    expect(await isCRD(mockFile())).toBe(true)
  })

  it('returns true with up to 6 star lines', async () => {
    mockReadFile('* a\n* b\n* c\n* d\n* e\n* f\n     99 EXT\n')
    expect(await isCRD(mockFile())).toBe(true)
  })

  it('returns false when more than 6 star lines', async () => {
    mockReadFile('* a\n* b\n* c\n* d\n* e\n* f\n* g\nEXT\n')
    expect(await isCRD(mockFile())).toBe(false)
  })

  it('returns false when EXT marker is missing', async () => {
    mockReadFile('* title\n* subtitle\nno EXT here\n')
    expect(await isCRD(mockFile())).toBe(false)
  })

  it('returns false with only one star line', async () => {
    mockReadFile('* title\n     12345 EXT\n')
    expect(await isCRD(mockFile())).toBe(false)
  })

  it('returns false on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await isCRD(mockFile())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isPsfData
// ---------------------------------------------------------------------------
const validPsfContent = [
  'PSF EXT CMAP XPLOR',
  '',
  '       1 !NTITLE',
  ' REMARKS generated',
  '',
  '       2 !NATOM',
  '         1 PROA      1 ALA  N    NH1   -0.470000E+00   14.007000       0',
  '         2 PROA      1 ALA  HT1  HC     0.310000E+00    1.008000       0'
].join('\n')

describe('isPsfData', () => {
  it('returns true for a valid PSF file', async () => {
    mockReadFile(validPsfContent)
    expect(await isPsfData(mockFile())).toBe(true)
  })

  it('returns false when first line does not contain PSF', async () => {
    mockReadFile(validPsfContent.replace('PSF EXT CMAP XPLOR', 'XPLOR EXT CMAP'))
    expect(await isPsfData(mockFile())).toBe(false)
  })

  it('returns false when !NTITLE line is missing', async () => {
    const content = validPsfContent.replace('       1 !NTITLE', '       1 !OTHER')
    mockReadFile(content)
    expect(await isPsfData(mockFile())).toBe(false)
  })

  it('returns false when !NATOM line is missing', async () => {
    const content = validPsfContent.replace('       2 !NATOM', '       2 !BONDS')
    mockReadFile(content)
    expect(await isPsfData(mockFile())).toBe(false)
  })

  it('returns false on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await isPsfData(mockFile())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// noSpaces
// ---------------------------------------------------------------------------
describe('noSpaces', () => {
  it('returns true when filename has no spaces', async () => {
    const file = { name: 'myfile.pdb' } as File
    expect(await noSpaces(file)).toBe(true)
  })

  it('returns false when filename contains a space', async () => {
    const file = { name: 'my file.pdb' } as File
    expect(await noSpaces(file)).toBe(false)
  })

  it('returns false when filename contains a tab', async () => {
    const file = { name: 'my\tfile.pdb' } as File
    expect(await noSpaces(file)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isSaxsData
// ---------------------------------------------------------------------------
const buildSaxsLines = (count: number): string => {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const q = (0.01 + i * 0.005).toFixed(4)
    lines.push(`${q}  100.0  5.0`)
  }
  return lines.join('\n')
}

describe('isSaxsData', () => {
  it('returns valid:true when >= minValidLines (100) valid data lines', async () => {
    mockReadFile(buildSaxsLines(100))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:false with message when fewer than minValidLines', async () => {
    mockReadFile(buildSaxsLines(50))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/50 valid lines/)
  })

  it('skips comment lines starting with #', async () => {
    const data = '# comment\n' + buildSaxsLines(100)
    mockReadFile(data)
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
  })

  it('skips blank lines', async () => {
    const data = '\n\n' + buildSaxsLines(100)
    mockReadFile(data)
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
  })

  it('rejects lines where q < 0.005', async () => {
    const bad = '0.001  100.0  5.0\n'
    mockReadFile(bad + buildSaxsLines(100))
    // The bad line is excluded; 100 valid lines still exist
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
  })

  it('rejects lines where q > 1.0', async () => {
    mockReadFile('1.5  100.0  5.0\n' + buildSaxsLines(100))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true) // bad line excluded, 100 valid remain
  })

  it('rejects lines where I <= 0', async () => {
    mockReadFile('0.01  -1.0  5.0\n' + buildSaxsLines(100))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true) // bad line excluded
  })

  it('respects custom minValidLines', async () => {
    mockReadFile(buildSaxsLines(10))
    const result = await isSaxsData(mockFile(), 10)
    expect(result.valid).toBe(true)
  })

  it('returns valid:false and message on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Error reading SAXS file content')
  })
})

// ---------------------------------------------------------------------------
// containsChainId
// ---------------------------------------------------------------------------
describe('containsChainId', () => {
  it('returns true when ATOM line has chain ID at column 22', async () => {
    // PDB format: columns are 1-indexed; column 22 (0-indexed 21) = chain ID
    const line = 'ATOM      1  N   ALA A   1      11.104  13.207  11.921  1.00 38.06           N'
    mockReadFile(line + '\n')
    expect(await containsChainId(mockFile())).toBe(true)
  })

  it('returns true for HETATM line with chain ID', async () => {
    const line = 'HETATM    1  C1  LIG B   1       1.000   2.000   3.000  1.00  0.00           C'
    mockReadFile(line + '\n')
    expect(await containsChainId(mockFile())).toBe(true)
  })

  it('returns false when no ATOM/HETATM lines', async () => {
    mockReadFile('REMARK no atoms here\nEND\n')
    expect(await containsChainId(mockFile())).toBe(false)
  })

  it('returns false on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await containsChainId(mockFile())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkPdbResidues
// ---------------------------------------------------------------------------
const atomLine = (residue: string, record = 'ATOM  ') =>
  `${record}    1  CA  ${residue} A   1       1.000   2.000   3.000  1.00  0.00           C`

describe('checkPdbResidues', () => {
  it('returns valid:true for all-standard amino acids', async () => {
    const content = ['ALA', 'GLY', 'SER', 'TYR', 'VAL']
      .map((r) => atomLine(r.padEnd(3)))
      .join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for phosphorylated residues SEP, TPO, PTR', async () => {
    const content = ['SEP', 'TPO', 'PTR'].map((r) => atomLine(r)).join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for nucleotide residues (DNA/RNA)', async () => {
    const content = ['DA ', 'DC ', 'DG ', 'DT ', 'A  ', 'C  ', 'G  ', 'U  ']
      .map((r) => atomLine(r))
      .join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for supported carbohydrate residues', async () => {
    const content = ['NAG', 'BMA', 'MAN', 'GAL', 'SIA']
      .map((r) => atomLine(r))
      .join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for HOH (water is removed by pdb2crd.py)', async () => {
    mockReadFile(atomLine('HOH'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for HETATM lines with supported residues', async () => {
    mockReadFile(atomLine('NAG', 'HETATM'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:false with message listing unsupported residues', async () => {
    const content = [atomLine('ALA'), atomLine('TPO'), atomLine('UNK'), atomLine('MSE')].join(
      '\n'
    )
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/MSE/)
    expect(result.message).toMatch(/UNK/)
    expect(result.message).not.toMatch(/ALA/)
    expect(result.message).not.toMatch(/TPO/)
  })

  it('returns valid:false and message on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Error reading PDB file.')
  })

  it('ignores non-ATOM/HETATM lines', async () => {
    mockReadFile('REMARK  some remark\nHEADER  some header\nEND\n')
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isRNA
// ---------------------------------------------------------------------------
describe('isRNA', () => {
  const rnaAtomLine = (residue: string) =>
    `ATOM      1  P   ${residue} A   1       1.000   2.000   3.000  1.00  0.00           P`

  it('returns valid:true for file with only valid RNA nucleotides', async () => {
    const content = [rnaAtomLine('A'), rnaAtomLine('C'), rnaAtomLine('G'), rnaAtomLine('U')].join(
      '\n'
    )
    mockReadFile(content)
    const result = await isRNA(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:false when HETATM lines are present', async () => {
    mockReadFile('HETATM    1  MG  MG  A   1       1.000   2.000   3.000\n')
    const result = await isRNA(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/HETATM/)
  })

  it('returns valid:false for invalid residue name', async () => {
    mockReadFile(rnaAtomLine('X') + '\n')
    const result = await isRNA(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/Invalid residue/)
  })

  it('returns valid:false on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await isRNA(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Error reading the file.')
  })
})

// ---------------------------------------------------------------------------
// isValidConstInpFile
// ---------------------------------------------------------------------------
describe('isValidConstInpFile', () => {
  const validPdbContent = [
    'define PROA sele segid PROA end',
    'cons fix sele PROA end',
    'return'
  ].join('\n')

  const validCrdContent = [
    'define ABCD sele segid ABCD end',
    'cons fix sele ABCD end',
    'return'
  ].join('\n')

  it('returns true for valid pdb-mode constraint file', async () => {
    mockReadFile(validPdbContent)
    expect(await isValidConstInpFile(mockFile(), 'pdb')).toBe(true)
  })

  it('returns true for valid crd_psf-mode constraint file', async () => {
    mockReadFile(validCrdContent)
    expect(await isValidConstInpFile(mockFile(), 'crd_psf')).toBe(true)
  })

  it('returns error when last line is not "return"', async () => {
    mockReadFile('define PROA sele segid PROA end\ncons fix sele PROA end\nnotreturn')
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/last line must be "return"/)
  })

  it('returns error when no "define" line', async () => {
    mockReadFile('cons fix sele PROA end\nreturn')
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/define/)
  })

  it('returns error when no "cons fix sele" line', async () => {
    mockReadFile('define PROA sele segid PROA end\nreturn')
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/cons fix sele/)
  })

  it('returns error for invalid pdb-mode segid format', async () => {
    mockReadFile('define BADID sele segid BADID end\ncons fix sele BADID end\nreturn')
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/segid must be/)
  })

  it('returns error for invalid crd_psf-mode segid (not 4 uppercase letters)', async () => {
    mockReadFile('define abc sele segid abc end\ncons fix sele abc end\nreturn')
    const result = await isValidConstInpFile(mockFile(), 'crd_psf')
    expect(result).toMatch(/segid must contain 4 uppercase letters/)
  })

  it('returns error string on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toBe('Error reading file')
  })

  it('returns error when file is empty', async () => {
    mockReadFile('')
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/last line must be "return"/)
  })
})
