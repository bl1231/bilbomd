import { describe, it, expect } from 'vitest'
import { readConstInp } from '../../constInpParser.js'
import {
  checkConstInpText,
  findDisallowedConstInpLine
} from '../../structureFileChecks.js'
import {
  MAX_CONSTRAINTS_JSON_LENGTH,
  MAX_RIGID_BODIES,
  parseConstraintsJson,
  validateConstraintsInput
} from '../validate.js'
import {
  pdb2crdSegid,
  readCifSegments,
  readPdbSegments,
  readPsfSegments
} from '../structure.js'
import { writeConstInp } from '../writeConstInp.js'
import { toOpenMMConstraints } from '../toOpenMM.js'
import {
  chainIdFromSegid,
  importConstraintsFromConstInp
} from '../fromConstInp.js'
import type {
  ConstraintStructure,
  Constraints,
  ConstraintsValidation
} from '../types.js'

// --- Fixtures ----------------------------------------------------------------

const atom = (
  chain: string,
  resName: string,
  resSeq: number,
  insertionCode = ' '
) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}${insertionCode}      1.000   2.000   3.000  1.00  0.00           C`

const residues = (chain: string, resName: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    atom(chain, resName, from + i)
  )

const PDB = [
  ...residues('A', 'ALA', 1, 200),
  ...residues('B', 'DA', 1, 30),
  atom('W', 'HOH', 1),
  'END'
].join('\n')

const pdbStructure: ConstraintStructure = {
  mode: 'pdb',
  segments: readPdbSegments(PDB)
}

const psfAtom = (n: number, segid: string, resid: string) =>
  `${String(n).padStart(8)} ${segid.padEnd(4)} ${resid.padEnd(4)} ALA  CA   CT1   0.070000   12.0110   0`

const PSF = [
  'PSF EXT',
  '',
  '       1 !NTITLE',
  '* test',
  '',
  '       5 !NATOM',
  psfAtom(1, 'PROA', '1'),
  psfAtom(2, 'PROA', '2'),
  psfAtom(3, 'PROA', '3'),
  psfAtom(4, 'HETA', '1'),
  psfAtom(5, 'HETA', '52A'),
  '',
  '       0 !NBOND: bonds'
].join('\n')

const psfStructure: ConstraintStructure = {
  mode: 'crd_psf',
  segments: readPsfSegments(PSF)
}

const ok = (result: ConstraintsValidation): Constraints => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.constraints
}

const errorsOf = (result: ConstraintsValidation) =>
  result.ok ? [] : result.errors

const twoBodies = {
  fixed_bodies: [
    { segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }] }
  ],
  rigid_bodies: [
    { segments: [{ chain_id: 'A', residues: { start: 60, stop: 150 } }] }
  ]
}

// --- Structure ---------------------------------------------------------------

describe('pdb2crdSegid', () => {
  it('names segments the way pdb2crd does, in uppercase', () => {
    expect(pdb2crdSegid('A', 'PRO')).toBe('PROA')
    expect(pdb2crdSegid('b', 'DNA')).toBe('DNAB')
    expect(pdb2crdSegid('C', 'CAR')).toBe('CARC')
    expect(pdb2crdSegid('c', 'CAR')).toBe('CALC')
  })

  it('uses CAL for a carbohydrate chain that is not an uppercase letter', () => {
    // pdb2crd tests chain.isupper(), which is false for digits
    expect(pdb2crdSegid('1', 'CAR')).toBe('CAL1')
  })
})

describe('readPdbSegments', () => {
  it('reads one segment per chain with a known molecule type', () => {
    expect(pdbStructure.segments.map((s) => [s.chain_id, s.segid])).toEqual([
      ['A', 'PROA'],
      ['B', 'DNAB']
    ])
    expect(pdbStructure.segments[0]?.residues).toHaveLength(200)
  })

  it('classifies the DNA names pdb_utils.py accepts (ADE, CYT, GUA, THY)', () => {
    const segments = readPdbSegments(
      [atom('B', 'ADE', 1), atom('B', 'THY', 2)].join('\n')
    )
    expect(segments).toEqual([
      { segid: 'DNAB', chain_id: 'B', mol_type: 'DNA', residues: [1, 2] }
    ])
  })

  // pdb2crd removes these before building the segment, so constraints on
  // them would select no atoms
  it('leaves out waters, ions and atoms with an insertion code', () => {
    const segments = readPdbSegments(
      [
        ...residues('A', 'ALA', 1, 3),
        atom('A', 'ALA', 3, 'A'),
        atom('A', 'HOH', 500),
        atom('A', 'NA', 600),
        atom('A', 'SO4', 700)
      ].join('\n')
    )
    expect(segments[0]?.residues).toEqual([1, 2, 3])
    const result = validateConstraintsInput(
      {
        fixed_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 500, stop: 500 } }] }
        ]
      },
      { mode: 'pdb', segments }
    )
    expect(result.ok).toBe(false)
  })
})

describe('readCifSegments', () => {
  it('reads chains from auth_asym_id and residues from auth_seq_id', () => {
    const cif = [
      'data_test',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.id',
      '_atom_site.label_atom_id',
      '_atom_site.label_comp_id',
      '_atom_site.label_asym_id',
      '_atom_site.label_seq_id',
      '_atom_site.auth_seq_id',
      '_atom_site.pdbx_PDB_ins_code',
      '_atom_site.auth_asym_id',
      '_atom_site.pdbx_PDB_model_num',
      'ATOM 1 CA ALA X 1 10 ? A 1',
      'ATOM 2 CA GLY X 2 11 ? A 1',
      'ATOM 3 CA GLY X 3 11 B A 1',
      'ATOM 4 P DA Y 1 5 ? B 1',
      'HETATM 5 O HOH Z . 900 ? W 1',
      '#'
    ].join('\n')
    expect(readCifSegments(cif)).toEqual([
      { segid: 'PROA', chain_id: 'A', mol_type: 'PRO', residues: [10, 11] },
      { segid: 'DNAB', chain_id: 'B', mol_type: 'DNA', residues: [5] }
    ])
  })
})

describe('readPsfSegments', () => {
  it('reads segids and whole-number residue IDs from !NATOM', () => {
    expect(psfStructure.segments).toEqual([
      { segid: 'PROA', chain_id: 'PROA', residues: [1, 2, 3] },
      { segid: 'HETA', chain_id: 'HETA', residues: [1] }
    ])
  })

  it('returns nothing for text without a !NATOM section', () => {
    expect(readPsfSegments('not a psf')).toEqual([])
  })
})

// --- Validation --------------------------------------------------------------

describe('parseConstraintsJson', () => {
  it('reads JSON', () => {
    expect(parseConstraintsJson('{"fixed_bodies":[]}')).toEqual({
      ok: true,
      value: { fixed_bodies: [] }
    })
  })

  it.each([
    ['nothing', undefined],
    ['an empty string', '  '],
    ['bad JSON', '{fixed_bodies'],
    ['an over-long field', `"${'x'.repeat(MAX_CONSTRAINTS_JSON_LENGTH)}"`]
  ])('rejects %s', (_, text) => {
    expect(parseConstraintsJson(text).ok).toBe(false)
  })
})

describe('validateConstraintsInput', () => {
  it('names bodies and fills in segids from the structure', () => {
    const result = validateConstraintsInput(twoBodies, pdbStructure)
    expect(ok(result)).toEqual({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 50 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'RigidBody1',
          segments: [
            { chain_id: 'A', segid: 'PROA', residues: { start: 60, stop: 150 } }
          ]
        }
      ]
    })
  })

  it('rejects a whole segment whose residue numbers go below 0', () => {
    const structure: ConstraintStructure = {
      mode: 'pdb',
      segments: readPdbSegments(residues('A', 'ALA', -2, 5).join('\n'))
    }
    const result = validateConstraintsInput(
      { fixed_bodies: [{ segments: [{ chain_id: 'A' }] }] },
      structure
    )
    expect(errorsOf(result)[0]?.message).toMatch(/outside 0-99999/)
    // A range inside 0-99999 on the same chain is fine
    expect(
      validateConstraintsInput(
        {
          fixed_bodies: [
            { segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }] }
          ]
        },
        structure
      ).ok
    ).toBe(true)
  })

  it('resolves a whole segment to its full residue range', () => {
    const result = validateConstraintsInput(
      { fixed_bodies: [{ segments: [{ chain_id: 'B' }] }] },
      pdbStructure
    )
    expect(ok(result).fixed_bodies[0]?.segments[0]).toEqual({
      chain_id: 'B',
      segid: 'DNAB',
      residues: { start: 1, stop: 30 },
      whole_segment: true
    })
  })

  it('accepts a segid that matches the structure', () => {
    const input = {
      fixed_bodies: [{ segments: [{ chain_id: 'A', segid: 'PROA' }] }]
    }
    expect(validateConstraintsInput(input, pdbStructure).ok).toBe(true)
  })

  it('warns about bodies with too few flexible residues between them', () => {
    const result = validateConstraintsInput(
      {
        fixed_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }] }
        ],
        rigid_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 51, stop: 90 } }] }
        ]
      },
      pdbStructure
    )
    expect(result.ok && result.warnings).toHaveLength(1)
  })

  it.each([
    ['a non-object', [], 'constraints'],
    ['an unknown top-level field', { ...twoBodies, extra: 1 }, 'constraints'],
    ['no fixed body', { fixed_bodies: [] }, 'fixed_bodies'],
    [
      'two fixed bodies',
      { fixed_bodies: [twoBodies.fixed_bodies[0], twoBodies.rigid_bodies[0]] },
      'fixed_bodies'
    ],
    [
      'a body with an unknown field',
      { fixed_bodies: [{ segments: [{ chain_id: 'A' }], name: 'x' }] },
      'fixed_bodies[0]'
    ],
    [
      'a body without segments',
      { fixed_bodies: [{ segments: [] }] },
      'fixed_bodies[0].segments'
    ],
    [
      'a segment with an unknown field',
      { fixed_bodies: [{ segments: [{ chain_id: 'A', whole: true }] }] },
      'fixed_bodies[0].segments[0]'
    ],
    [
      'a chain not in the structure',
      { fixed_bodies: [{ segments: [{ chain_id: 'Z' }] }] },
      'fixed_bodies[0].segments[0].chain_id'
    ],
    [
      'a segid that does not match the chain',
      { fixed_bodies: [{ segments: [{ chain_id: 'A', segid: 'PROB' }] }] },
      'fixed_bodies[0].segments[0].segid'
    ],
    [
      'a range with no residues in the segment',
      {
        fixed_bodies: [
          { segments: [{ chain_id: 'B', residues: { start: 100, stop: 120 } }] }
        ]
      },
      'fixed_bodies[0].segments[0].residues'
    ]
  ])('rejects %s', (_, input, path) => {
    expect(
      errorsOf(validateConstraintsInput(input, pdbStructure))
    ).toContainEqual(expect.objectContaining({ path }))
  })

  it(`rejects more than ${MAX_RIGID_BODIES} rigid bodies`, () => {
    const rigid = Array.from({ length: MAX_RIGID_BODIES + 1 }, (_, i) => ({
      segments: [
        { chain_id: 'A', residues: { start: 60 + i * 5, stop: 62 + i * 5 } }
      ]
    }))
    const result = validateConstraintsInput(
      { fixed_bodies: twoBodies.fixed_bodies, rigid_bodies: rigid },
      pdbStructure
    )
    expect(errorsOf(result)).toContainEqual(
      expect.objectContaining({ path: 'rigid_bodies' })
    )
  })

  it.each([
    ['a fraction', { start: 1.5, stop: 10 }],
    ['a negative number', { start: -1, stop: 10 }],
    ['a number too large', { start: 1, stop: 100000 }],
    ['start after stop', { start: 10, stop: 1 }],
    ['strings', { start: '1', stop: '10' }],
    ['an extra field', { start: 1, stop: 10, step: 2 }],
    ['not an object', '1:10']
  ])('rejects residues given as %s', (_, range) => {
    const input = {
      fixed_bodies: [{ segments: [{ chain_id: 'A', residues: range }] }]
    }
    expect(validateConstraintsInput(input, pdbStructure).ok).toBe(false)
  })

  it.each([
    ['rigid bodies', 'rigid_bodies', { start: 140, stop: 180 }],
    ['a fixed and a rigid body', 'fixed_bodies', { start: 40, stop: 70 }]
  ])('rejects %s that share residues', (_, kind, range) => {
    const input = {
      ...twoBodies,
      rigid_bodies: [
        ...twoBodies.rigid_bodies,
        ...(kind === 'rigid_bodies'
          ? [{ segments: [{ chain_id: 'A', residues: range }] }]
          : [])
      ],
      ...(kind === 'fixed_bodies'
        ? {
            fixed_bodies: [{ segments: [{ chain_id: 'A', residues: range }] }]
          }
        : {})
    }
    const errors = errorsOf(validateConstraintsInput(input, pdbStructure))
    expect(errors[0]?.message).toMatch(/both include segment PROA/)
  })

  it('rejects a structure whose chains differ only in case', () => {
    const structure: ConstraintStructure = {
      mode: 'pdb',
      segments: readPdbSegments(
        [...residues('A', 'ALA', 1, 5), ...residues('a', 'ALA', 1, 5)].join(
          '\n'
        )
      )
    }
    const errors = errorsOf(
      validateConstraintsInput(
        { fixed_bodies: [{ segments: [{ chain_id: 'A' }] }] },
        structure
      )
    )
    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'structure',
        message: expect.stringMatching(
          /Chains A and a would both be CHARMM segment PROA/
        )
      })
    )
  })

  // Strings an attacker might send to reach CHARMM through a segid or chain ID
  it.each([
    'A ) end\nsystem "id"',
    'A;',
    'PROA ) end',
    'proa',
    'PRO!',
    'ÄBCD',
    'PROAA',
    '',
    'A B',
    '@a'
  ])('rejects the segid or chain ID %j', (value) => {
    const asChain = { fixed_bodies: [{ segments: [{ chain_id: value }] }] }
    const asSegid = { fixed_bodies: [{ segments: [{ segid: value }] }] }
    expect(validateConstraintsInput(asChain, pdbStructure).ok).toBe(false)
    expect(validateConstraintsInput(asSegid, psfStructure).ok).toBe(false)
  })

  describe('CRD/PSF mode', () => {
    it('names segments by segid', () => {
      const result = validateConstraintsInput(
        {
          fixed_bodies: [
            { segments: [{ segid: 'PROA', residues: { start: 1, stop: 2 } }] }
          ],
          rigid_bodies: [{ segments: [{ segid: 'HETA' }] }]
        },
        psfStructure
      )
      const constraints = ok(result)
      expect(constraints.fixed_bodies[0]?.segments[0]).toEqual({
        chain_id: 'PROA',
        segid: 'PROA',
        residues: { start: 1, stop: 2 }
      })
      expect(constraints.rigid_bodies[0]?.segments[0]?.whole_segment).toBe(true)
    })

    it.each([
      ['no segid', { chain_id: 'A' }, 'segid'],
      ['a segid not in the PSF', { segid: 'PROB' }, 'segid'],
      [
        'a chain_id unlike the segid',
        { segid: 'PROA', chain_id: 'A' },
        'chain_id'
      ]
    ])('rejects %s', (_, segment, field) => {
      const errors = errorsOf(
        validateConstraintsInput(
          { fixed_bodies: [{ segments: [segment] }] },
          psfStructure
        )
      )
      expect(errors).toContainEqual(
        expect.objectContaining({
          path: `fixed_bodies[0].segments[0].${field}`
        })
      )
    })
  })

  // Whatever is sent, either validation fails or the file written from it
  // holds only allowed commands
  it('never lets random input into const.inp unchecked', () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    const alphabet = 'AaBPROD0129 ;"\'!@?$`()-.:*/\\\n\r\t\u0000é'
    const randomString = () =>
      Array.from(
        { length: 1 + Math.floor(random() * 6) },
        () => alphabet[Math.floor(random() * alphabet.length)]
      ).join('')

    for (let i = 0; i < 2000; i++) {
      for (const [structure, segment] of [
        [pdbStructure, { chain_id: randomString(), segid: randomString() }],
        [psfStructure, { segid: randomString() }]
      ] as const) {
        const result = validateConstraintsInput(
          { fixed_bodies: [{ segments: [segment] }] },
          structure
        )
        if (!result.ok) continue
        const text = writeConstInp(result.constraints)
        expect(findDisallowedConstInpLine(text)).toBeNull()
      }
    }
  })
})

// --- Writers -----------------------------------------------------------------

describe('writeConstInp', () => {
  const constraints = ok(
    validateConstraintsInput(
      {
        fixed_bodies: [
          {
            segments: [
              { chain_id: 'A', residues: { start: 1, stop: 50 } },
              { chain_id: 'B' }
            ]
          }
        ],
        rigid_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 60, stop: 100 } }] },
          {
            segments: [
              { chain_id: 'A', residues: { start: 110, stop: 150 } },
              { chain_id: 'A', residues: { start: 160, stop: 190 } }
            ]
          }
        ]
      },
      pdbStructure
    )
  )

  it('writes one cons fix and a shape desc per rigid body', () => {
    expect(writeConstInp(constraints)).toBe(
      [
        '* Constraints written by BilboMD',
        '*',
        'define fixed1 sele ( resid 1:50 .and. segid PROA ) end',
        'define fixed2 sele ( segid DNAB ) end',
        'cons fix sele fixed1 .or. fixed2 end',
        '',
        'define rigid1 sele ( resid 60:100 .and. segid PROA ) end',
        'shape desc dock1 rigid sele rigid1 end',
        '',
        'define rigid2 sele ( resid 110:150 .and. segid PROA ) end',
        'define rigid3 sele ( resid 160:190 .and. segid PROA ) end',
        'shape desc dock2 rigid sele rigid2 .or. rigid3 end',
        '',
        'return',
        ''
      ].join('\n')
    )
  })

  it('passes the checks run on constraint files', () => {
    const text = writeConstInp(constraints)
    expect(checkConstInpText(text, 'pdb')).toBe(true)
    expect(findDisallowedConstInpLine(text)).toBeNull()
  })

  it('reads back as the same bodies', () => {
    const report = readConstInp(writeConstInp(constraints))
    expect(report.skipped).toEqual([])
    expect(report.fixed_bodies).toHaveLength(1)
    expect(report.fixed_bodies[0]?.selections).toEqual([
      { segid: 'PROA', residues: { start: 1, stop: 50 } },
      { segid: 'DNAB', residues: null }
    ])
    expect(report.rigid_bodies.map((b) => b.selections.length)).toEqual([1, 2])
  })

  it('wraps a long cons fix over continuation lines', () => {
    const many = ok(
      validateConstraintsInput(
        {
          fixed_bodies: [
            {
              segments: Array.from({ length: 30 }, (_, i) => ({
                chain_id: 'A',
                residues: { start: i * 5 + 1, stop: i * 5 + 3 }
              }))
            }
          ]
        },
        pdbStructure
      )
    )
    const text = writeConstInp(many)
    expect(text.split('\n').every((line) => line.length <= 80)).toBe(true)
    expect(readConstInp(text).fixed_bodies[0]?.selections).toHaveLength(30)
  })

  // A caller that skips validation must get an error, not a file
  it.each([
    ['a bad segid', { segid: 'PROA ) end\nsystem "id"' }],
    ['a lowercase segid', { segid: 'proa' }],
    ['a fractional residue', { residues: { start: 1.5, stop: 2 } }],
    ['a reversed range', { residues: { start: 5, stop: 1 } }],
    ['a residue number too large', { residues: { start: 1, stop: 1e21 } }]
  ])('refuses %s', (_, change) => {
    const segment = {
      chain_id: 'A',
      segid: 'PROA',
      residues: { start: 1, stop: 2 },
      ...change
    }
    expect(() =>
      writeConstInp({
        fixed_bodies: [{ name: 'FixedBody1', segments: [segment] }],
        rigid_bodies: []
      })
    ).toThrow(/Refusing to write const.inp/)
  })

  it('refuses anything but exactly one fixed body', () => {
    expect(() =>
      writeConstInp({ fixed_bodies: [], rigid_bodies: [] })
    ).toThrow()
    const body = constraints.fixed_bodies[0]!
    expect(() =>
      writeConstInp({ fixed_bodies: [body, body], rigid_bodies: [] })
    ).toThrow()
  })
})

describe('toOpenMMConstraints', () => {
  it('writes segments by chain with explicit ranges', () => {
    const constraints = ok(
      validateConstraintsInput(
        { fixed_bodies: [{ segments: [{ chain_id: 'B' }] }] },
        pdbStructure
      )
    )
    expect(toOpenMMConstraints(constraints)).toEqual({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [{ chain_id: 'B', residues: { start: 1, stop: 30 } }]
        }
      ],
      rigid_bodies: []
    })
  })
})

// --- Importing an old const.inp ----------------------------------------------

describe('chainIdFromSegid', () => {
  it.each([
    ['PROA', 'A'],
    ['DNAB', 'B'],
    ['CARC', 'C'],
    ['CALC', 'c'],
    ['PRLD', 'd'],
    ['proa', 'A'],
    ['HETA', null],
    ['PRO', null],
    ['PROAB', null]
  ])('%s → %s', (segid, chain) => {
    expect(chainIdFromSegid(segid)).toBe(chain)
  })
})

describe('importConstraintsFromConstInp', () => {
  const file = [
    'define fixed1 sele ( resid 1:50 .and. segid PROA ) end',
    'cons fix sele fixed1 end',
    'define rigid1 sele ( segid DNAB ) end',
    'shape desc dock1 rigid sele rigid1 end',
    'return'
  ].join('\n')

  it('reads bodies by chain in PDB mode, ready to validate', () => {
    const imported = importConstraintsFromConstInp(file, 'pdb')
    expect(imported.problems).toEqual([])
    expect(imported.input).toEqual({
      fixed_bodies: [
        { segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }] }
      ],
      rigid_bodies: [{ segments: [{ chain_id: 'B' }] }]
    })
    expect(validateConstraintsInput(imported.input, pdbStructure).ok).toBe(true)
  })

  it('keeps segids in CRD/PSF mode', () => {
    const imported = importConstraintsFromConstInp(
      file.replace('DNAB', 'HETA'),
      'crd_psf'
    )
    expect(imported.input?.rigid_bodies).toEqual([
      { segments: [{ segid: 'HETA' }] }
    ])
  })

  it('asks which body is fixed when there are several cons fix commands', () => {
    const twoFix = [
      'define a sele ( resid 1:10 .and. segid PROA ) end',
      'define b sele ( resid 20:30 .and. segid PROA ) end',
      'cons fix sele a end',
      'cons fix sele b end',
      'return'
    ].join('\n')
    const unchosen = importConstraintsFromConstInp(twoFix, 'pdb')
    expect(unchosen.input).toBeNull()
    expect(unchosen.fixed_choices).toHaveLength(2)
    expect(unchosen.problems.join(' ')).toMatch(
      /Choose which is the fixed body/
    )

    const chosen = importConstraintsFromConstInp(twoFix, 'pdb', {
      fixedBody: 1
    })
    expect(chosen.input?.fixed_bodies).toEqual([
      { segments: [{ chain_id: 'A', residues: { start: 20, stop: 30 } }] }
    ])
  })

  it('leaves out and reports anything else, such as a system command', () => {
    const attack = file.replace(
      'cons fix sele fixed1 end',
      'cons fix sele fixed1 end\nsystem "id"'
    )
    const imported = importConstraintsFromConstInp(attack, 'pdb')
    expect(imported.problems).toContain('Left out: system "id"')
    expect(imported.input?.fixed_bodies).toHaveLength(1)
  })

  it('reports a segid that names no PDB chain in PDB mode', () => {
    const imported = importConstraintsFromConstInp(
      file.replace('DNAB', 'HETA'),
      'pdb'
    )
    expect(imported.problems.join(' ')).toMatch(/Segment HETA/)
    expect(imported.input?.rigid_bodies).toBeUndefined()
  })

  it('reports a shape name used twice, which CHARMM would merge', () => {
    const twice = [
      'define fixed1 sele ( resid 1:10 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'define rigid1 sele ( resid 20:30 .and. segid PROA ) end',
      'shape desc dock1 rigid sele rigid1 end',
      'define rigid2 sele ( resid 40:50 .and. segid PROA ) end',
      'shape desc dock1 rigid sele rigid2 end',
      'return'
    ].join('\n')
    const imported = importConstraintsFromConstInp(twice, 'pdb')
    expect(imported.problems.join(' ')).toMatch(
      /"shape desc dock1" is used more than once/
    )
  })

  it('needs a cons fix', () => {
    const imported = importConstraintsFromConstInp('return', 'pdb')
    expect(imported.input).toBeNull()
    expect(imported.problems.join(' ')).toMatch(/no usable "cons fix"/)
  })
})
