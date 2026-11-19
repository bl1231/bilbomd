import { describe, it, expect } from 'vitest'
import {
  readPdbSegments,
  readPsfSegments,
  validateConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { importConstraintsFile } from '../importConstraintsFile'
import { previewConstraints } from '../previewConstraints'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

// Protein chain a (segment PROA) and DNA chain A (segment DNAA)
const segments: StructureSegment[] = readPdbSegments(
  [
    ...Array.from({ length: 100 }, (_, i) => atom('a', 'ALA', i + 1)),
    ...Array.from({ length: 20 }, (_, i) => atom('A', 'DA', i + 1))
  ].join('\n')
)

const constInp = (...lines: string[]) => [...lines, 'return'].join('\n')

describe('importConstraintsFile: const.inp', () => {
  it('matches segids to the structure', () => {
    const result = importConstraintsFile(
      constInp(
        'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'define rigid1 sele ( segid DNAA ) end',
        'shape desc dock1 rigid sele rigid1 end'
      ),
      'const.inp',
      'pdb',
      segments
    )
    expect(result.problems).toEqual([])
    expect(result.fixedChoices).toEqual([])
    // PROA is chain a here, not A
    expect(result.input).toEqual({
      fixed_bodies: [
        {
          segments: [
            { chain_id: 'a', segid: 'PROA', residues: { start: 1, stop: 40 } }
          ]
        }
      ],
      rigid_bodies: [{ segments: [{ chain_id: 'A', segid: 'DNAA' }] }]
    })
  })

  it('asks which cons fix is the fixed body, then uses the one picked', () => {
    const text = constInp(
      'define a sele ( resid 1:10 .and. segid PROA ) end',
      'define b sele ( resid 20:30 .and. segid PROA ) end',
      'cons fix sele a end',
      'cons fix sele b end'
    )
    const asked = importConstraintsFile(text, 'const.inp', 'pdb', segments)
    expect(asked.input).toBeNull()
    expect(asked.fixedChoices).toHaveLength(2)
    // The question is not a problem with the file
    expect(asked.problems).toEqual([])

    const picked = importConstraintsFile(text, 'const.inp', 'pdb', segments, 1)
    expect(picked.fixedChoices).toEqual([])
    expect(picked.input?.fixed_bodies[0]?.segments[0]?.residues).toEqual({
      start: 20,
      stop: 30
    })
  })

  it('reports anything it leaves out, such as system', () => {
    const result = importConstraintsFile(
      constInp(
        'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'system "id"'
      ),
      'const.inp',
      'pdb',
      segments
    )
    expect(result.problems).toContain('Left out: system "id"')
  })

  it('reads a file with another extension as a const.inp', () => {
    const result = importConstraintsFile(
      constInp(
        'define fixed1 sele ( segid PROA ) end',
        'cons fix sele fixed1 end'
      ),
      'my-constraints.txt',
      'pdb',
      segments
    )
    expect(result.input?.fixed_bodies[0]?.segments[0]?.segid).toBe('PROA')
  })

  it('reads CRD/PSF segids', () => {
    const psf = readPsfSegments(
      [
        '       2 !NATOM',
        '       1 PROA 1    ALA  CA   CT1   0.07   12.011   0',
        '       2 PROA 2    ALA  CA   CT1   0.07   12.011   0'
      ].join('\n')
    )
    const result = importConstraintsFile(
      constInp('define f sele ( segid PROA ) end', 'cons fix sele f end'),
      'const.inp',
      'crd_psf',
      psf
    )
    expect(result.input?.fixed_bodies[0]?.segments).toEqual([
      expect.objectContaining({ segid: 'PROA' })
    ])
  })
})

describe('importConstraintsFile: YAML and JSON', () => {
  it("reads an OpenMM results download's openmm_config.yaml", () => {
    const result = importConstraintsFile(
      [
        'input:',
        '  pdb_file: model.pdb',
        'constraints:',
        '  fixed_bodies:',
        '    - name: FixedBody1',
        '      segments:',
        '        - chain_id: a',
        '          residues:',
        '            start: 1',
        '            stop: 40',
        '  rigid_bodies:',
        '    - name: RigidBody1',
        '      segments:',
        '        - chain_id: A',
        '          residues:',
        '            start: 1',
        '            stop: 20'
      ].join('\n'),
      'openmm_config.yaml',
      'pdb',
      segments
    )
    expect(result.problems).toEqual([])
    expect(result.notes).toEqual([])
    expect(result.input).toEqual({
      fixed_bodies: [
        {
          segments: [
            { chain_id: 'a', segid: 'PROA', residues: { start: 1, stop: 40 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          segments: [
            { chain_id: 'A', segid: 'DNAA', residues: { start: 1, stop: 20 } }
          ]
        }
      ]
    })
  })

  it('reads JSON and reports fields it leaves out', () => {
    const result = importConstraintsFile(
      JSON.stringify({
        fixed_bodies: [{ segments: [{ chain_id: 'a', extra: 1 }] }]
      }),
      'constraints.json',
      'pdb',
      segments
    )
    expect(result.input).toEqual({
      fixed_bodies: [{ segments: [{ chain_id: 'a' }] }]
    })
    expect(result.problems.join(' ')).toContain('left out field "extra"')
  })

  it('says so when a YAML file cannot be read', () => {
    const result = importConstraintsFile(
      'constraints: [unclosed',
      'broken.yml',
      'pdb',
      segments
    )
    expect(result.input).toBeNull()
    expect(result.problems).toEqual([
      'The file could not be read as YAML or JSON'
    ])
  })
})

describe('previewConstraints', () => {
  it('adds each chain’s molecule type, as the job page shows it', () => {
    const input = importConstraintsFile(
      constInp(
        'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'define rigid1 sele ( segid DNAA ) end',
        'shape desc dock1 rigid sele rigid1 end'
      ),
      'const.inp',
      'pdb',
      segments
    ).input
    const checked = validateConstraintsInput(input, {
      mode: 'pdb',
      segments,
      engine: 'openmm'
    })
    if (!checked.ok) throw new Error('expected valid constraints')
    const preview = previewConstraints(checked.constraints, segments)
    expect(preview.fixed_bodies?.[0]?.name).toBe('FixedBody1')
    expect(preview.chain_mol_types).toEqual([
      { chain_id: 'a', mol_type: 'PRO' },
      { chain_id: 'A', mol_type: 'DNA' }
    ])
  })
})
