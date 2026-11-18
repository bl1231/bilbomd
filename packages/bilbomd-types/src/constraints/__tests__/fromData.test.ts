import { describe, it, expect } from 'vitest'
import { importConstraintsFromData } from '../fromData.js'
import { validateConstraintsInput } from '../validate.js'
import type { StructureSegment } from '../types.js'

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
// Protein chain a is segment PROA; DNA chain A is DNAA
const structure: StructureSegment[] = [
  { segid: 'PROA', chain_id: 'a', mol_type: 'PRO', residues: range(300) },
  { segid: 'DNAA', chain_id: 'A', mol_type: 'DNA', residues: range(30) }
]

// As pae2const.py and the backend write openmm_const.yml
const openmmFile = {
  constraints: {
    fixed_bodies: [
      {
        name: 'FixedBody1',
        segments: [{ chain_id: 'a', residues: { start: 1, stop: 100 } }]
      }
    ],
    rigid_bodies: [
      {
        name: 'RigidBody1',
        segments: [{ chain_id: 'a', residues: { start: 120, stop: 200 } }]
      }
    ]
  }
}

describe('importConstraintsFromData', () => {
  it('reads an OpenMM constraints file', () => {
    const imported = importConstraintsFromData(openmmFile, 'pdb')
    expect(imported.problems).toEqual([])
    expect(imported.input).toEqual({
      fixed_bodies: [
        { segments: [{ chain_id: 'a', residues: { start: 1, stop: 100 } }] }
      ],
      rigid_bodies: [
        { segments: [{ chain_id: 'a', residues: { start: 120, stop: 200 } }] }
      ]
    })
    expect(
      validateConstraintsInput(imported.input, {
        mode: 'pdb',
        segments: structure
      }).ok
    ).toBe(true)
  })

  it("reads the constraints from a results download's full openmm_config.yaml", () => {
    const fullConfig = {
      input: { dir: '/bilbomd/uploads/x', pdb_file: 'model.pdb' },
      output: { output_dir: '/bilbomd/uploads/x/openmm' },
      steps: { minimization: { max_iterations: 1000 } },
      ...openmmFile
    }
    const imported = importConstraintsFromData(fullConfig, 'pdb')
    expect(imported.problems).toEqual([])
    expect(imported.input).toEqual(
      importConstraintsFromData(openmmFile, 'pdb').input
    )
  })

  it('reads the bodies at the top level too (the API JSON)', () => {
    const imported = importConstraintsFromData(openmmFile.constraints, 'pdb')
    expect(imported.input?.fixed_bodies).toHaveLength(1)
  })

  it('merges several fixed bodies, which OpenMM all holds in place', () => {
    const imported = importConstraintsFromData(
      {
        fixed_bodies: [
          { segments: [{ chain_id: 'a', residues: { start: 1, stop: 10 } }] },
          {
            segments: [
              {
                chain_id: 'A',
                whole_segment: true,
                residues: { start: 1, stop: 30 }
              }
            ]
          }
        ]
      },
      'pdb'
    )
    expect(imported.input?.fixed_bodies).toEqual([
      {
        segments: [
          { chain_id: 'a', residues: { start: 1, stop: 10 } },
          { chain_id: 'A' }
        ]
      }
    ])
    expect(imported.problems.join(' ')).toMatch(/2 fixed bodies were merged/)
  })

  it('leaves out and reports unknown fields, ignoring stored metadata', () => {
    const imported = importConstraintsFromData(
      {
        _id: 'x',
        chain_mol_types: [],
        fixed_bodies: [
          {
            _id: 'b',
            name: 'FixedBody1',
            force: 5,
            segments: [{ chain_id: 'a', sele: 'system "id"' }]
          }
        ],
        rigid_body: []
      },
      'pdb'
    )
    expect(imported.problems).toEqual([
      'Left out field "rigid_body"',
      'Fixed body 1: left out field "force"',
      'Fixed body 1, segment 1: left out field "sele"'
    ])
    expect(imported.input).toEqual({
      fixed_bodies: [{ segments: [{ chain_id: 'a' }] }]
    })
  })

  it('matches a segid to its chain in the structure (PDB mode)', () => {
    const imported = importConstraintsFromData(
      { fixed_bodies: [{ segments: [{ segid: 'PROA' }] }] },
      'pdb',
      { structure }
    )
    expect(imported.input?.fixed_bodies[0]?.segments).toEqual([
      { chain_id: 'a' }
    ])
  })

  it('needs segids for CRD/PSF jobs', () => {
    const imported = importConstraintsFromData(
      {
        fixed_bodies: [{ segments: [{ segid: 'proa' }, { chain_id: 'A' }] }]
      },
      'crd_psf'
    )
    expect(imported.input?.fixed_bodies[0]?.segments).toEqual([
      { segid: 'PROA' }
    ])
    expect(imported.problems.join(' ')).toMatch(/name segments by segid/)
  })

  it.each([
    ['not an object', 'fixed_bodies'],
    ['no fixed body', { rigid_bodies: [] }],
    ['an empty file', null]
  ])('gives no constraints for %s', (_, data) => {
    expect(importConstraintsFromData(data, 'pdb').input).toBeNull()
  })
})
