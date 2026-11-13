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
  sharedResidueNumbersMessage,
  checkRnaResidues,
  checkConstInpText,
  findDisallowedConstInpLine,
  findDuplicateShapeNames,
  duplicateShapeNamesMessage,
  joinConstInpLines,
  wrapConstInpCommand,
  constInpLengthMessage,
  MAX_CONST_INP_SHAPE_COMMANDS,
  MAX_CONST_INP_LINE_LENGTH,
  MAX_CONST_INP_COMMAND_LENGTH,
  CONST_INP_WRAP_WIDTH
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

describe('sharedResidueNumbersMessage', () => {
  it('names each shared residue', () => {
    expect(
      sharedResidueNumbersMessage(['chain E residue 215 (ASP and NAG)'])
    ).toMatch(
      /^PDB has residues that share a chain and residue number: chain E residue 215 \(ASP and NAG\)\. Give each residue/
    )
  })

  it('lists three and counts the rest', () => {
    const shared = [1, 2, 3, 4, 5].map(
      (n) => `chain A residue ${n} (ALA and NAG)`
    )
    const message = sharedResidueNumbersMessage(shared)
    expect(message).toContain('residue 3 (ALA and NAG) and 2 more')
    expect(message).not.toContain('residue 4')
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

describe('findDuplicateShapeNames', () => {
  it('returns nothing when every shape desc name is unique', () => {
    expect(
      findDuplicateShapeNames(
        lines(
          'shape desc dock1 rigid sele rigid1 end',
          'shape desc dock2 rigid sele rigid2 end'
        )
      )
    ).toEqual([])
  })

  it('finds a name reused by a later shape desc line', () => {
    expect(
      findDuplicateShapeNames(
        lines(
          'define rigid1 sele ( resid 52:64 .and. segid PROC ) end',
          'shape desc dock1 rigid sele rigid1 end ',
          'define rigid1 sele ( resid 133:144 .and. segid PROA ) end',
          'shape desc dock1 rigid sele rigid1 end ',
          'return'
        )
      )
    ).toEqual(['dock1'])
  })

  it('ignores case, indentation and the long DESCriptor keyword', () => {
    expect(
      findDuplicateShapeNames(
        lines(
          'SHAPE DESC DOCK1 RIGID SELE rigid1 END',
          '   shape descriptor dock1 rigid sele rigid2 end',
          'shape desc dock2 rigid sele rigid3 end',
          'Shape Desc Dock2 rigid sele rigid4 end',
          'shape desc dock1 rigid sele rigid5 end'
        )
      )
    ).toEqual(['dock1', 'Dock2'])
  })

  it('ignores comments and other shape commands', () => {
    expect(
      findDuplicateShapeNames(
        lines(
          '! shape desc dock1 rigid sele rigid1 end',
          'shape desc dock1 rigid sele rigid1 end'
        )
      )
    ).toEqual([])
  })
})

describe('duplicateShapeNamesMessage', () => {
  it('is null when names are unique', () => {
    expect(
      duplicateShapeNamesMessage('shape desc dock1 rigid sele rigid1 end')
    ).toBeNull()
  })

  it('names the repeated shape and how to fix it', () => {
    expect(
      duplicateShapeNamesMessage(
        lines(
          'shape desc dock1 rigid sele rigid1 end',
          'shape desc dock1 rigid sele rigid2 end'
        )
      )
    ).toBe(
      'Each "shape desc" line needs its own name, but "dock1" is used more ' +
        'than once. CHARMM would treat the repeat as a change to the earlier ' +
        'rigid body, not a new one. Rename them, e.g. dock1, dock2.'
    )
  })
})

describe('checkConstInpText duplicate shape names', () => {
  it('rejects a constraint file that reuses a shape desc name', () => {
    expect(
      checkConstInpText(
        lines(
          'define fixed1 sele ( resid 1:130 .and. segid PROA ) end',
          'cons fix sele fixed1 end',
          'define rigid1 sele ( resid 52:64 .and. segid PROC ) end',
          'shape desc dock1 rigid sele rigid1 end',
          'define rigid1 sele ( resid 133:144 .and. segid PROA ) end',
          'shape desc dock1 rigid sele rigid1 end',
          'return'
        ),
        'pdb'
      )
    ).toMatch(/"dock1" is used more than once/)
  })

  it('accepts reused define names when shape names are unique', () => {
    expect(
      checkConstInpText(
        lines(
          'define fixed1 sele ( resid 1:130 .and. segid PROA ) end',
          'cons fix sele fixed1 end',
          'define rigid1 sele ( resid 52:64 .and. segid PROC ) end',
          'shape desc dock1 rigid sele rigid1 end',
          'define rigid1 sele ( resid 133:144 .and. segid PROA ) end',
          'shape desc dock2 rigid sele rigid1 end',
          'return'
        ),
        'pdb'
      )
    ).toBe(true)
  })
})

describe('findDisallowedConstInpLine', () => {
  // As pae2const.py writes it
  const generated = lines(
    'define fixed1 sele ( resid 2:27 .and. segid PROA ) end',
    'cons fix sele fixed1 end ',
    '',
    'define rigid1 sele ( resid 9:28 .and. segid PROB ) end',
    'shape desc dock1 rigid sele rigid1 end ',
    '',
    'return ',
    ''
  )

  it('returns null for a generated constraint file', () => {
    expect(findDisallowedConstInpLine(generated)).toBeNull()
  })

  it('allows titles, comments and blank lines', () => {
    expect(
      findDisallowedConstInpLine(
        lines('* title', '*', '! note', '   ', 'return')
      )
    ).toBeNull()
  })

  it.each([
    ['system', 'system "touch ../../x.txt"'],
    ['the abbreviated form', 'syst "id"'],
    ['any case', 'SyStEm "id"'],
    ['leading spaces', '   syst "id"'],
    ['a tab', '\tsystem "id"'],
    ['bomlev', 'bomlev -5'],
    ['stream', 'stream other.str']
  ])('returns the first disallowed line: %s', (_, line) => {
    expect(findDisallowedConstInpLine(lines('* t', line, 'return'))).toBe(
      line.trim()
    )
  })

  it.each([
    ['CRLF', '\r\n'],
    ['bare CR', '\r']
  ])('splits %s line endings', (_, eol) => {
    const file = ['define x sele segid PROA end', 'system "id"', 'return'].join(
      eol
    )
    expect(findDisallowedConstInpLine(file)).toBe('system "id"')
  })
})

describe('checkConstInpText line endings', () => {
  it('rejects a command hidden behind a bare carriage return', () => {
    const file =
      'define x sele segid PROA end\rsystem "id"\ncons fix sele x end\nreturn'
    expect(checkConstInpText(file, 'pdb')).toBe(
      'Disallowed keyword in constraint file: "system "id""'
    )
  })

  it('accepts a valid file with CRLF line endings', () => {
    const file = [
      'define x sele ( segid PROA ) end',
      'cons fix sele x end',
      'return'
    ].join('\r\n')
    expect(checkConstInpText(file, 'pdb')).toBe(true)
  })
})

// How the Inp Jiffy used to wrap long commands: cut every 77 characters, even
// mid-word, and add '-'. CHARMM reads these fine and users still have such
// files, so the checks must keep accepting them.
const wrapMidWord = (line: string): string[] => {
  const out: string[] = []
  for (let i = 0; i < line.length; i += 77) {
    const piece = line.slice(i, i + 77)
    out.push(i + 77 < line.length ? `${piece}-` : piece)
  }
  return out
}

const names = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`).join(' .or. ')

describe('joinConstInpLines', () => {
  // Each case matches what the worker's CHARMM (c49b2) was seen to do

  it('joins a line ending in "-" to the next with no space added', () => {
    expect(joinConstInpLines(lines('sele r-', 'igid5 end'))).toEqual([
      'sele rigid5 end'
    ])
  })

  it.each([
    ['trailing spaces', 'a .or. -   '],
    ['a comment after the hyphen', 'a .or. - ! note'],
    ['two hyphens (one is kept)', 'a .or. --']
  ])('joins after %s', (_, first) => {
    expect(joinConstInpLines(lines(first, 'b end'))).toHaveLength(1)
  })

  it('joins across a CRLF line ending', () => {
    expect(joinConstInpLines('a .or. -\r\nb end')).toEqual(['a .or. b end'])
  })

  it.each([
    ['a hyphen inside a comment', 'a .or. ! note -'],
    ['a comment line', '! comment -'],
    ['a tab after the hyphen', 'a .or. -\t'],
    ['a title line', '* title -']
  ])('does not join after %s', (_, first) => {
    expect(joinConstInpLines(lines(first, 'b end'))).toEqual([first, 'b end'])
  })

  it('joins only the very next line, even a blank one', () => {
    expect(joinConstInpLines(lines('a .or. -', '', 'b end'))).toEqual([
      'a .or. ',
      'b end'
    ])
  })

  it('keeps a hyphen on the last line as its own command', () => {
    expect(joinConstInpLines('a .or. -')).toEqual(['a .or. '])
  })
})

describe('findDisallowedConstInpLine with continuation lines', () => {
  it('accepts commands the Inp Jiffy wrapped mid-word', () => {
    const file = lines(
      'define rigid1 sele ( resid 1:5 .and. segid PROA ) end',
      ...wrapMidWord(`shape desc dock1 rigid sele ${names('rigid', 10)} end`),
      'return'
    )
    expect(findDisallowedConstInpLine(file)).toBeNull()
  })

  it.each([
    ['a tab after the hyphen', 'define x sele segid PROA end -\t'],
    ['a hyphen inside a comment', 'define x sele segid PROA end ! -'],
    ['a comment line', '! note -'],
    ['a title line', '* title -']
  ])('still sees a command after %s', (_, first) => {
    expect(
      findDisallowedConstInpLine(lines(first, 'system "id"', 'return'))
    ).toBe('system "id"')
  })

  it('still sees a command after the blank line a hyphen joins', () => {
    expect(
      findDisallowedConstInpLine(
        lines('define x sele segid PROA end -', '', 'system "id"', 'return')
      )
    ).toBe('system "id"')
  })
})

describe('wrapConstInpCommand', () => {
  const command = `cons fix sele ${names('fixed', 30)} end`

  it('keeps every line within the width, ending all but the last in " -"', () => {
    const wrapped = wrapConstInpCommand(command)
    expect(wrapped.length).toBeGreaterThan(1)
    for (const line of wrapped) {
      expect(line.length).toBeLessThanOrEqual(CONST_INP_WRAP_WIDTH)
    }
    expect(wrapped.slice(0, -1).every((l) => l.endsWith(' -'))).toBe(true)
    expect(wrapped.at(-1)).toMatch(/end$/)
  })

  it('reads back as the same command', () => {
    expect(joinConstInpLines(wrapConstInpCommand(command).join('\n'))).toEqual([
      command
    ])
  })

  it('leaves a short command on one line', () => {
    expect(wrapConstInpCommand('cons fix sele fixed1 end')).toEqual([
      'cons fix sele fixed1 end'
    ])
  })

  it('puts a word longer than the width on a line of its own', () => {
    expect(wrapConstInpCommand(`a ${'x'.repeat(20)} b`, 10)).toEqual([
      'a -',
      `${'x'.repeat(20)} -`,
      'b'
    ])
  })
})

describe('constInpLengthMessage', () => {
  const lineOf = (length: number) =>
    `define x sele segid PROA end ${'!'.padEnd(length - 29, '.')}`

  it(`accepts a line of ${MAX_CONST_INP_LINE_LENGTH} characters`, () => {
    expect(lineOf(MAX_CONST_INP_LINE_LENGTH)).toHaveLength(200)
    expect(constInpLengthMessage(lineOf(MAX_CONST_INP_LINE_LENGTH))).toBeNull()
  })

  it('rejects a longer line, naming it', () => {
    expect(
      constInpLengthMessage(lines('* t', lineOf(MAX_CONST_INP_LINE_LENGTH + 1)))
    ).toMatch(/^Line 2 is longer than 200 characters/)
  })

  it('ignores trailing spaces', () => {
    expect(
      constInpLengthMessage(`${lineOf(MAX_CONST_INP_LINE_LENGTH)}      `)
    ).toBeNull()
  })

  it(`rejects a continued command over ${MAX_CONST_INP_COMMAND_LENGTH} characters`, () => {
    const long = `cons fix sele ${names('fixed', 400)} end`
    expect(long.length).toBeGreaterThan(MAX_CONST_INP_COMMAND_LENGTH)
    expect(constInpLengthMessage(wrapConstInpCommand(long).join('\n'))).toMatch(
      /^A command is longer than 5000 characters/
    )
  })

  it('accepts a long command wrapped over many lines', () => {
    const wrapped = wrapConstInpCommand(
      `cons fix sele ${names('fixed', 100)} end`
    )
    expect(constInpLengthMessage(wrapped.join('\n'))).toBeNull()
  })
})

describe('checkConstInpText with long commands', () => {
  const defines = Array.from(
    { length: 20 },
    (_, i) =>
      `define fixed${i + 1} sele ( resid ${i * 10 + 1}:${i * 10 + 5} .and. segid PROA ) end`
  )

  it('accepts a file the Inp Jiffy wrapped mid-word', () => {
    const file = lines(
      ...defines,
      ...wrapMidWord(`cons fix sele ${names('fixed', 20)} end`),
      'return'
    )
    expect(checkConstInpText(file, 'pdb')).toBe(true)
  })

  it('accepts a file wrapped at spaces', () => {
    const file = lines(
      ...defines,
      ...wrapConstInpCommand(`cons fix sele ${names('fixed', 20)} end`),
      'return'
    )
    expect(checkConstInpText(file, 'pdb')).toBe(true)
  })

  it('rejects a command on one line longer than CHARMM reads', () => {
    const file = lines(
      ...defines,
      `cons fix sele ${names('fixed', 20)} end`,
      'return'
    )
    expect(checkConstInpText(file, 'pdb')).toMatch(
      /^Line 21 is longer than 200 characters/
    )
  })

  it('counts a wrapped shape command once', () => {
    const shapes = Array.from(
      { length: MAX_CONST_INP_SHAPE_COMMANDS },
      (_, i) =>
        wrapConstInpCommand(
          `shape desc dock${i + 1} rigid sele ${names('fixed', 8)} end`
        )
    ).flat()
    const file = lines(
      ...defines,
      'cons fix sele fixed1 end',
      ...shapes,
      'return'
    )
    expect(checkConstInpText(file, 'pdb')).toBe(true)
  })
})
