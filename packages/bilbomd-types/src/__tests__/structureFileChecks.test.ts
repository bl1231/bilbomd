import { describe, it, expect } from 'vitest'
import {
  isFromCharmmGui,
  isCrdText,
  isPsfText,
  pdbContainsChainId,
  pdbIsSingleModel,
  findUnsupportedPdbResidues,
  findLowercaseResidueNames,
  residueCaseMessage,
  findSharedResidueNumbers,
  checkRnaResidues,
  checkConstInpText,
  MAX_CONST_INP_SHAPE_COMMANDS
} from '../structureFileChecks.js'

const lines = (...l: string[]) => l.join('\n')

// Fixed-column PDB atom record. Each call gets its own residue number unless
// one is given.
let nextResidueNumber = 1
const atomLine = (
  residue: string,
  {
    record = 'ATOM  ',
    chain = 'A',
    number = nextResidueNumber++,
    altLoc = ' '
  } = {}
) =>
  `${record}    1  CA ${altLoc}${residue.padEnd(3)} ${chain}${String(number).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

describe('isFromCharmmGui', () => {
  it('finds CHARMM-GUI in the first five lines', () => {
    expect(isFromCharmmGui(lines('REMARK', 'REMARK CHARMM-GUI 3.7'))).toBe(true)
  })

  it('ignores a mention after line five', () => {
    expect(isFromCharmmGui(lines('1', '2', '3', '4', '5', 'CHARMM-GUI'))).toBe(
      false
    )
  })

  it('is false without a mention', () => {
    expect(isFromCharmmGui('REMARK made by hand')).toBe(false)
  })
})

describe('isCrdText', () => {
  it('accepts a two-line title followed by the atom count and EXT', () => {
    expect(isCrdText(lines('* title', '*', '     1234  EXT'))).toBe(true)
  })

  it('accepts up to six title lines', () => {
    expect(isCrdText(lines('*', '*', '*', '*', '*', '*', '   10  EXT'))).toBe(
      true
    )
  })

  it('rejects more than six title lines', () => {
    expect(
      isCrdText(lines('*', '*', '*', '*', '*', '*', '*', '   10  EXT'))
    ).toBe(false)
  })

  it('rejects a one-line title', () => {
    expect(isCrdText(lines('* title', '   10  EXT'))).toBe(false)
  })

  it('rejects a title with no EXT line after it', () => {
    expect(isCrdText(lines('* a', '* b', '   1   1 PROA MET N 1.0 2.0'))).toBe(
      false
    )
    expect(isCrdText(lines('* a', '* b', '* c'))).toBe(false)
  })
})

describe('isPsfText', () => {
  const atom = (n: number) =>
    `         ${n} PROA      1 ALA  N    NH1   -0.470000E+00   14.007000       0`
  const psf = (natom: number, atoms: string[], title = '       1 !NTITLE') =>
    lines(
      'PSF EXT CMAP XPLOR',
      '',
      title,
      ' REMARKS',
      '',
      `       ${natom} !NATOM`,
      ...atoms
    )

  it('accepts a PSF whose atom lines match !NATOM', () => {
    expect(isPsfText(psf(2, [atom(1), atom(2)]))).toBe(true)
  })

  it('rejects a file without a PSF header', () => {
    expect(isPsfText(psf(2, [atom(1), atom(2)]).replace('PSF', 'XYZ'))).toBe(
      false
    )
  })

  it('rejects a file without !NTITLE', () => {
    expect(isPsfText(psf(2, [atom(1), atom(2)], ' 1 TITLE'))).toBe(false)
  })

  it('rejects a file without !NATOM', () => {
    expect(isPsfText(lines('PSF', '  1 !NTITLE', atom(1)))).toBe(false)
  })

  it('rejects fewer atom lines than !NATOM announces', () => {
    expect(isPsfText(psf(3, [atom(1), atom(2)]))).toBe(false)
  })

  it('rejects a malformed atom line', () => {
    expect(isPsfText(psf(2, [atom(1), 'not an atom']))).toBe(false)
  })
})

describe('pdbContainsChainId', () => {
  it('finds a chain letter in column 22 of ATOM or HETATM records', () => {
    expect(pdbContainsChainId(atomLine('ALA'))).toBe(true)
    expect(pdbContainsChainId(atomLine('NAG', { record: 'HETATM' }))).toBe(true)
  })

  it('is false when column 22 is blank', () => {
    expect(pdbContainsChainId(atomLine('ALA', { chain: ' ' }))).toBe(false)
  })

  it('is false without atom records', () => {
    expect(pdbContainsChainId(lines('REMARK', 'END'))).toBe(false)
    expect(pdbContainsChainId('')).toBe(false)
  })
})

describe('pdbIsSingleModel', () => {
  const atom = atomLine('G')

  it('accepts a file without MODEL records', () => {
    expect(pdbIsSingleModel(lines(atom, 'END'))).toBe(true)
  })

  it('accepts a single MODEL', () => {
    expect(pdbIsSingleModel(lines('MODEL        1', atom, 'ENDMDL'))).toBe(true)
  })

  it('rejects an ensemble with several MODELs', () => {
    expect(
      pdbIsSingleModel(
        lines(
          'MODEL        1',
          atom,
          'ENDMDL',
          'MODEL        2',
          atom,
          'ENDMDL'
        )
      )
    ).toBe(false)
  })

  it('counts only MODEL records, not other words starting with MODEL', () => {
    expect(
      pdbIsSingleModel(lines('MODEL        1', 'MODELLER-generated', atom))
    ).toBe(true)
  })
})

describe('findUnsupportedPdbResidues', () => {
  it.each([
    ['standard amino acids', ['ALA', 'GLY', 'SER', 'TYR', 'VAL']],
    ['phosphorylated residues', ['SEP', 'TPO', 'PTR']],
    ['nucleotides', ['DA', 'DC', 'DG', 'DT', 'A', 'C', 'G', 'U']],
    ['carbohydrates', ['NAG', 'BMA', 'MAN', 'GAL', 'SIA']],
    ['water and ions', ['HOH', 'MG', 'CA', 'ZN']],
    ['CHARMM histidine names', ['HSD']],
    ['GAFF and metal cofactors', ['PCA', 'FAD', 'HEM']]
  ])('accepts %s', (_, residues) => {
    expect(
      findUnsupportedPdbResidues(lines(...residues.map((r) => atomLine(r))))
    ).toEqual([])
  })

  it('lists each unsupported residue once, sorted', () => {
    const text = lines(
      atomLine('ALA'),
      atomLine('UNK'),
      atomLine('MSE', { record: 'HETATM' }),
      atomLine('UNK')
    )
    expect(findUnsupportedPdbResidues(text)).toEqual(['MSE', 'UNK'])
  })

  it('skips records with a blank residue name', () => {
    expect(findUnsupportedPdbResidues(atomLine(''))).toEqual([])
  })

  it('reports a lowercase residue name as written', () => {
    expect(findUnsupportedPdbResidues(atomLine('ala'))).toEqual(['ala'])
  })

  it('ignores records other than ATOM and HETATM', () => {
    expect(findUnsupportedPdbResidues(lines('REMARK UNK', 'END'))).toEqual([])
  })
})

describe('findLowercaseResidueNames', () => {
  it('picks out supported residues written in lower or mixed case', () => {
    expect(findLowercaseResidueNames(['ala', 'Gly', 'UNK', 'unk'])).toEqual([
      'ala',
      'Gly'
    ])
  })

  it('is empty when every name is uppercase', () => {
    expect(findLowercaseResidueNames(['UNK', 'MSE'])).toEqual([])
  })
})

describe('residueCaseMessage', () => {
  it('lists the names and shows the fix', () => {
    expect(residueCaseMessage(['gly', 'leu'])).toBe(
      'Residue names must be uppercase (found: gly, leu). Change them to uppercase, for example gly to GLY.'
    )
  })
})

describe('findSharedResidueNumbers', () => {
  it('finds a sugar numbered like a protein residue in the same chain', () => {
    const text = lines(
      atomLine('ASP', { chain: 'E', number: 215 }),
      atomLine('NAG', { record: 'HETATM', chain: 'E', number: 215 }),
      atomLine('PRO', { chain: 'E', number: 216 })
    )
    expect(findSharedResidueNumbers(text)).toEqual([
      'chain E residue 215 (ASP and NAG)'
    ])
  })

  it('accepts the same number in different chains', () => {
    const text = lines(
      atomLine('ASP', { chain: 'A', number: 215 }),
      atomLine('NAG', { record: 'HETATM', chain: 'B', number: 215 })
    )
    expect(findSharedResidueNumbers(text)).toEqual([])
  })

  it('ignores waters and ions, which are stripped before MD', () => {
    const text = lines(
      atomLine('ASP', { number: 5 }),
      atomLine('HOH', { record: 'HETATM', number: 5 }),
      atomLine('ZN', { record: 'HETATM', number: 5 })
    )
    expect(findSharedResidueNumbers(text)).toEqual([])
  })

  it('accepts alternate conformers with different residue names', () => {
    const text = lines(
      atomLine('SER', { number: 9, altLoc: 'A' }),
      atomLine('THR', { number: 9, altLoc: 'B' })
    )
    expect(findSharedResidueNumbers(text)).toEqual([])
  })

  it('tells CHARMM segments apart by segment ID', () => {
    const charmmLine = (residue: string, segid: string) =>
      `ATOM      1  CA  ${residue} P   3       1.000   2.000   3.000  1.00  0.00      ${segid}`
    expect(
      findSharedResidueNumbers(
        lines(charmmLine('ILE', 'PROA'), charmmLine('ASN', 'PROB'))
      )
    ).toEqual([])
  })

  it('tells residues apart by insertion code', () => {
    const text = lines(
      'ATOM      1  CA  ASP A 100       1.000   2.000   3.000  1.00  0.00           C',
      'ATOM      2  CA  GLY A 100A      1.000   2.000   3.000  1.00  0.00           C'
    )
    expect(findSharedResidueNumbers(text)).toEqual([])
  })

  it('reads only the first model', () => {
    const text = lines(
      atomLine('ASP', { number: 7 }),
      'ENDMDL',
      atomLine('NAG', { record: 'HETATM', number: 7 })
    )
    expect(findSharedResidueNumbers(text)).toEqual([])
  })
})

describe('checkRnaResidues', () => {
  const rna = (residue: string) =>
    `ATOM      1  P   ${residue} A   1       1.000   2.000   3.000  1.00  0.00           P`

  it('accepts A, C, G and U', () => {
    expect(
      checkRnaResidues(lines(rna('A'), rna('C'), rna('G'), rna('U')))
    ).toEqual({ valid: true })
  })

  it('rejects HETATM records', () => {
    const result = checkRnaResidues('HETATM    1  MG  MG  A   1')
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/HETATM/)
  })

  it('rejects other residue names', () => {
    expect(checkRnaResidues(rna('X'))).toEqual({
      valid: false,
      message: "Invalid residue name 'X'. Expected A, C, G, U."
    })
  })

  it('rejects an ATOM record too short to name a residue', () => {
    expect(checkRnaResidues('ATOM').valid).toBe(false)
  })
})

describe('checkConstInpText', () => {
  const valid = (...extra: string[]) =>
    lines(
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      ...extra,
      'return'
    )

  it('accepts a minimal file', () => {
    expect(checkConstInpText(valid(), 'pdb')).toBe(true)
  })

  it('accepts comments, harmonic constraints and shape descriptors', () => {
    expect(
      checkConstInpText(
        lines(
          '* CHARMM constraint file',
          '! fixed and rigid bodies',
          valid(
            'cons harm force 10.0 sele fixed1 end',
            'shape desc dock1 rigid sele fixed1 end'
          )
        ),
        'pdb'
      )
    ).toBe(true)
  })

  it('needs "return" as the last line', () => {
    expect(checkConstInpText('define x\ncons fix sele x end\nreturnx')).toBe(
      'The last line must be "return".'
    )
    expect(checkConstInpText('')).toBe('The last line must be "return".')
  })

  it('needs a define line', () => {
    expect(checkConstInpText('cons fix sele x end\nreturn')).toMatch(/define/)
  })

  it('needs a cons fix sele line', () => {
    expect(checkConstInpText('define x sele segid PROA end\nreturn')).toMatch(
      /cons fix sele/
    )
  })

  it('checks segment IDs for PDB input', () => {
    const file = 'define x sele segid BADID end\ncons fix sele x end\nreturn'
    expect(checkConstInpText(file, 'pdb')).toMatch(/segid must be/)
  })

  it('checks segment IDs for CRD/PSF input', () => {
    const file = 'define x sele segid abc end\ncons fix sele x end\nreturn'
    expect(checkConstInpText(file, 'crd_psf')).toMatch(
      /segid must contain 4 uppercase letters/
    )
  })

  it('skips the segment ID check for other modes', () => {
    const file = 'define x sele segid abc end\ncons fix sele x end\nreturn'
    expect(checkConstInpText(file, 'auto')).toBe(true)
    expect(checkConstInpText(file)).toBe(true)
  })

  it(`allows at most ${MAX_CONST_INP_SHAPE_COMMANDS} shape commands`, () => {
    const shapes = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `shape desc dock${i + 1} rigid sele fixed1 end`
      )
    expect(
      checkConstInpText(valid(...shapes(MAX_CONST_INP_SHAPE_COMMANDS)), 'pdb')
    ).toBe(true)
    expect(
      checkConstInpText(
        valid(...shapes(MAX_CONST_INP_SHAPE_COMMANDS + 1)),
        'pdb'
      )
    ).toMatch(/Too many CHARMM shape commands/)
  })

  it.each([
    ['uppercase', 'SHAPE DESC'],
    ['mixed case', 'Shape Desc'],
    ['indented', '   shape desc']
  ])('counts %s shape commands toward the limit', (_, command) => {
    const shapes = Array.from(
      { length: MAX_CONST_INP_SHAPE_COMMANDS + 1 },
      (_, i) => `${command} dock${i + 1} rigid sele fixed1 end`
    )
    expect(checkConstInpText(valid(...shapes), 'pdb')).toMatch(
      /Too many CHARMM shape commands/
    )
  })

  it.each([
    'system "curl https://example.com"',
    'open unit 10 write card name /tmp/out',
    'stream other.str',
    'shape ellipsoid'
  ])('rejects a line starting with another keyword: %s', (line) => {
    expect(checkConstInpText(valid(line), 'pdb')).toBe(
      `Disallowed keyword in constraint file: "${line}"`
    )
  })

  it('matches keywords regardless of case and leading spaces', () => {
    expect(checkConstInpText(valid('   CONS HARM force 1 sele x end'))).toBe(
      true
    )
  })
})
