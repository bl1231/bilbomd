import { describe, it, expect } from 'vitest'
import { readCifSegments, readPdbSegments } from '../structure.js'
import { validateConstraintsInput } from '../validate.js'
import type { ConstraintStructure } from '../types.js'

// Separate molecules that share a chain ID: pdb2crd.py builds each as its
// own CHARMM segment (issue #1331), and these readers must name them the same
// way. The cases mirror tools/python/python_tests/test_pdb2crd.py.

const num = (n: number, width: number) => n.toFixed(3).padStart(width)

const atomLine = (
  name: string,
  resName: string,
  chain: string,
  resSeq: number,
  [x, y, z]: [number, number, number],
  segid = '',
  record = 'ATOM'
) =>
  `${record.padEnd(6)}    1 ${(name.length === 4 ? name : ` ${name}`).padEnd(4)} ${resName.padStart(3)} ${chain}${String(resSeq).padStart(4)}    ` +
  `${num(x, 8)}${num(y, 8)}${num(z, 8)}  1.00  0.00      ${segid.padEnd(4)}`

// A nucleotide's backbone along x; O3' is 1.6 A from the next residue's P
// when residues are 6 A apart
const nucleotide = (
  chain: string,
  resSeq: number,
  [ox, oy, oz]: [number, number, number],
  segid = '',
  withP = true
) => [
  ...(withP ? [atomLine('P', 'DA', chain, resSeq, [ox, oy, oz], segid)] : []),
  atomLine("O5'", 'DA', chain, resSeq, [ox + 0.8, oy, oz], segid),
  atomLine("C5'", 'DA', chain, resSeq, [ox + 2.0, oy, oz], segid),
  atomLine("O3'", 'DA', chain, resSeq, [ox + 4.4, oy, oz], segid)
]

const strand = (
  chain: string,
  first: number,
  count: number,
  [ox, oy, oz]: [number, number, number],
  segid = '',
  firstHasP = false
) =>
  Array.from({ length: count }, (_, i) =>
    nucleotide(
      chain,
      first + i,
      [ox + 6 * i, oy, oz],
      segid,
      firstHasP || i > 0
    )
  ).flat()

const protein = (chain: string, first: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    atomLine('CA', 'GLY', chain, first + i, [3.8 * i, 50, 0])
  )

const FAR: [number, number, number] = [0, 0, 40]

const segids = (lines: string[]) =>
  readPdbSegments([...lines, 'END'].join('\n')).map((s) => s.segid)

describe('readPdbSegments: separate molecules in one chain', () => {
  it('keeps one bonded strand as one segment', () => {
    expect(segids(strand('D', 1, 4, [0, 0, 0]))).toEqual(['DNAD'])
  })

  it('splits strands with different segids (the old pro_dna.pdb)', () => {
    const segments = readPdbSegments(
      [
        ...strand('D', 22, 3, [0, 0, 0], 'DNAA'),
        ...strand('D', 60, 3, FAR, 'DNAB')
      ].join('\n')
    )
    expect(segments).toEqual([
      { segid: 'DNAD', chain_id: 'D', mol_type: 'DNA', residues: [22, 23, 24] },
      { segid: 'DNAB', chain_id: 'D', mol_type: 'DNA', residues: [60, 61, 62] }
    ])
  })

  it('splits at a TER record even when the strands would bond', () => {
    expect(
      segids([
        ...strand('D', 1, 3, [0, 0, 0]),
        'TER',
        ...strand('D', 4, 3, [18, 0, 0], '', true)
      ])
    ).toEqual(['DNAD', 'DNAA'])
  })

  it('splits unbonded strands with no TER or segids', () => {
    expect(
      segids([
        ...strand('D', 22, 3, [0, 0, 0]),
        ...strand('D', 60, 3, FAR, '', true)
      ])
    ).toEqual(['DNAD', 'DNAA'])
  })

  it('skips letters other chains use', () => {
    expect(
      segids([
        ...protein('A', 1, 3),
        ...strand('D', 1, 3, [0, 0, 0], 'DNAD'),
        ...strand('D', 60, 3, FAR, 'DNAA')
      ])
    ).toEqual(['PROA', 'DNAD', 'DNAB'])
  })

  it('gives a glycan after TER its own segment', () => {
    expect(
      segids([
        ...protein('A', 1, 3),
        'TER',
        atomLine('C1', 'NAG', 'A', 901, [0, 0, 0], '', 'HETATM')
      ])
    ).toEqual(['PROA', 'CARA'])
  })

  it('drops water and ions after TER without using a letter', () => {
    expect(
      segids([
        ...strand('D', 1, 2, [0, 0, 0], 'DNAA'),
        'TER',
        atomLine('ZN', 'ZN', 'D', 436, [0, 0, 0], 'HETA', 'HETATM'),
        ...strand('D', 60, 2, FAR, 'DNAB')
      ])
    ).toEqual(['DNAD', 'DNAB'])
  })

  it('reads only the first model', () => {
    const model = strand('D', 1, 2, [0, 0, 0])
    expect(
      segids(['MODEL 1', ...model, 'TER', 'ENDMDL', 'MODEL 2', ...model])
    ).toEqual(['DNAD'])
  })
})

describe('readCifSegments: separate molecules in one chain', () => {
  const header = [
    'data_test',
    'loop_',
    '_atom_site.group_PDB',
    '_atom_site.label_atom_id',
    '_atom_site.label_comp_id',
    '_atom_site.auth_asym_id',
    '_atom_site.auth_seq_id',
    '_atom_site.Cartn_x',
    '_atom_site.Cartn_y',
    '_atom_site.Cartn_z',
    '_atom_site.pdbx_PDB_model_num'
  ]
  const row = (name: string, resSeq: number, x: number, z: number, model = 1) =>
    `ATOM "${name}" DA D ${resSeq} ${x} 0 ${z} ${model}`
  const cifStrand = (first: number, z: number, model = 1) =>
    [0, 1].flatMap((i) => [
      ...(i > 0 ? [row('P', first + i, 6 * i, z, model)] : []),
      row("O5'", first + i, 6 * i + 0.8, z, model),
      row("O3'", first + i, 6 * i + 4.4, z, model)
    ])

  it('splits unbonded strands that share a chain ID', () => {
    const cif = [...header, ...cifStrand(22, 0), ...cifStrand(60, 40)].join(
      '\n'
    )
    expect(readCifSegments(cif).map((s) => s.segid)).toEqual(['DNAD', 'DNAA'])
  })

  it('reads only the first model', () => {
    const cif = [...header, ...cifStrand(1, 0), ...cifStrand(1, 0, 2)].join(
      '\n'
    )
    expect(readCifSegments(cif).map((s) => s.segid)).toEqual(['DNAD'])
  })
})

describe('validateConstraintsInput: a chain that is several segments', () => {
  const structure: ConstraintStructure = {
    mode: 'pdb',
    segments: readPdbSegments(
      [
        ...protein('P', 1, 5),
        ...strand('D', 22, 3, [0, 0, 0], 'DNAA'),
        ...strand('D', 60, 3, FAR, 'DNAB')
      ].join('\n')
    )
  }
  const validate = (segments: unknown[]) =>
    validateConstraintsInput({ fixed_bodies: [{ segments }] }, structure)

  it('picks the segment that holds the residues', () => {
    const result = validate([
      { chain_id: 'D', residues: { start: 60, stop: 62 } }
    ])
    expect(result.ok && result.constraints.fixed_bodies[0]?.segments).toEqual([
      { chain_id: 'D', segid: 'DNAB', residues: { start: 60, stop: 62 } }
    ])
  })

  it('picks a whole segment named by segid', () => {
    const result = validate([{ chain_id: 'D', segid: 'DNAD' }])
    expect(result.ok && result.constraints.fixed_bodies[0]?.segments).toEqual([
      {
        chain_id: 'D',
        segid: 'DNAD',
        residues: { start: 22, stop: 24 },
        whole_segment: true
      }
    ])
  })

  it('rejects the whole chain and says how to fix it', () => {
    const result = validate([{ chain_id: 'D' }])
    expect(!result.ok && result.errors[0]?.message).toBe(
      'Chain D is built as 2 separate CHARMM segments, DNAD (residues ' +
        '22-24) and DNAB (residues 60-62) (separate molecules, or a chain ' +
        'break). Select each one with its own residue range, or name it ' +
        'with segid; they can be in the same body.'
    )
  })

  it('rejects a range that spans two segments', () => {
    const result = validate([
      { chain_id: 'D', residues: { start: 22, stop: 62 } }
    ])
    expect(!result.ok && result.errors[0]?.message).toMatch(
      /span 2 separate CHARMM segments, DNAD .* and DNAB .*within one segment/
    )
  })

  it("rejects a segid that is not one of the chain's segments", () => {
    const result = validate([{ chain_id: 'D', segid: 'DNAA' }])
    expect(!result.ok && result.errors[0]?.message).toBe(
      'Chain D is segments DNAD, DNAB, not DNAA'
    )
  })
})

// Backbone N, CA, C per residue along x; C(i)-N(i+1) is 1.33 A
const peptide = (chain: string, first: number, count: number, x0 = 0) =>
  Array.from({ length: count }, (_, i) => {
    const x = x0 + 3.8 * i
    return (
      [
        ['N', 0],
        ['CA', 1.2],
        ['C', 2.47]
      ] as const
    ).map(([name, dx]) =>
      atomLine(name, 'ALA', chain, first + i, [x + dx, 50, 0])
    )
  }).flat()

describe('protein chain breaks (missing loops)', () => {
  // Residues 124-140 missing, the two sides 31.3 A apart (as pdb2crd.py
  // reports it in test_pdb2crd.py)
  const gapped = [
    ...peptide('A', 120, 4),
    ...peptide('A', 141, 3, 3.8 * 4 + 30)
  ]

  it('builds the two sides as separate segments', () => {
    expect(readPdbSegments(gapped.join('\n'))).toEqual([
      {
        segid: 'PROA',
        chain_id: 'A',
        mol_type: 'PRO',
        residues: [120, 121, 122, 123]
      },
      {
        segid: 'PROB',
        chain_id: 'A',
        mol_type: 'PRO',
        residues: [141, 142, 143],
        chain_break: { after: 123, distance: 31.3 }
      }
    ])
  })

  it('does not split bonded residues with a numbering gap', () => {
    expect(
      segids([...peptide('A', 1, 3), ...peptide('A', 10, 3, 3.8 * 3)])
    ).toEqual(['PROA'])
  })

  it('warns about the break, and accepts a body with both sides', () => {
    const structure: ConstraintStructure = {
      mode: 'pdb',
      segments: readPdbSegments(gapped.join('\n'))
    }
    const result = validateConstraintsInput(
      {
        fixed_bodies: [
          {
            segments: [
              { chain_id: 'A', residues: { start: 120, stop: 123 } },
              { chain_id: 'A', residues: { start: 141, stop: 143 } }
            ]
          }
        ]
      },
      structure
    )
    expect(result.ok && result.warnings).toEqual([
      'Chain A has a chain break between residues 123 and 141: they are ' +
        '31.3 Å apart, so they are not bonded. BilboMD builds the two sides ' +
        'as separate segments (PROA and PROB), which can move apart during ' +
        'MD. If residues are missing there, model them before submitting.'
    ])
  })

  it('does not warn about separate molecules split at a segid change', () => {
    const structure: ConstraintStructure = {
      mode: 'pdb',
      segments: readPdbSegments(
        [
          ...strand('D', 22, 3, [0, 0, 0], 'DNAA'),
          ...strand('D', 60, 3, FAR, 'DNAB')
        ].join('\n')
      )
    }
    const result = validateConstraintsInput(
      { fixed_bodies: [{ segments: [{ chain_id: 'D', segid: 'DNAD' }] }] },
      structure
    )
    expect(result.ok && result.warnings).toEqual([])
  })
})
