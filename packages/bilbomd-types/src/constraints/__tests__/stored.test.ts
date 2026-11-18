import { describe, it, expect } from 'vitest'
import { constraintsFromStored, inputFromStored } from '../stored.js'
import { readCifSegments } from '../structure.js'
import { validateConstraintsInput } from '../validate.js'
import type { MDConstraintsDTO } from '../../jobs/mdConstraints.js'

const stored: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [
        { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 5 } }
      ]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [
        {
          chain_id: 'B',
          segid: 'DNAB',
          residues: { start: 1, stop: 9 },
          whole_segment: true
        }
      ]
    }
  ],
  chain_mol_types: [{ chain_id: 'A', mol_type: 'PRO' }]
}

describe('constraintsFromStored', () => {
  it('turns stored constraints with segids back into constraints', () => {
    expect(constraintsFromStored(stored)).toEqual({
      fixed_bodies: stored.fixed_bodies,
      rigid_bodies: stored.rigid_bodies
    })
  })

  it('returns null for constraints stored without segids', () => {
    expect(
      constraintsFromStored({
        fixed_bodies: [
          {
            name: 'FixedBody1',
            segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }]
          }
        ]
      })
    ).toBeNull()
    expect(constraintsFromStored(undefined)).toBeNull()
    expect(constraintsFromStored({})).toBeNull()
  })
})

describe('inputFromStored', () => {
  it('gives PDB-mode input by chain, keeping whole segments whole', () => {
    expect(inputFromStored(stored, 'pdb')).toEqual({
      fixed_bodies: [
        { segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }] }
      ],
      rigid_bodies: [{ segments: [{ chain_id: 'B' }] }]
    })
  })

  it('gives CRD/PSF input by segid', () => {
    expect(inputFromStored(stored, 'crd_psf')).toMatchObject({
      fixed_bodies: [
        { segments: [{ segid: 'PROA', residues: { start: 1, stop: 5 } }] }
      ]
    })
  })

  it('keeps a misspelled top-level field, so the job is not run without it', () => {
    const typo = {
      fixed_bodies: [
        { segments: [{ chain_id: 'A', residues: { start: 1, stop: 2 } }] }
      ],
      rigid_body: [{ segments: [{ chain_id: 'A' }] }]
    }
    const result = validateConstraintsInput(inputFromStored(typo, 'pdb'), {
      mode: 'pdb',
      segments: [{ segid: 'PROA', chain_id: 'A', residues: [1, 2, 3] }]
    })
    expect(!result.ok && result.errors[0]?.message).toMatch(/rigid_body/)
  })

  // md_constraints as a job record returns them: MongoDB adds _id (and
  // mongoose an id virtual) to every body, segment and residue range
  it('drops the database ids on a job record, so resubmit validates', () => {
    const fromDb = {
      _id: 'c0',
      fixed_bodies: [
        {
          _id: 'b1',
          id: 'b1',
          name: 'FixedBody1',
          segments: [
            {
              _id: 's1',
              chain_id: 'A',
              segid: 'PROA',
              residues: { _id: 'r1', start: 40, stop: 137 }
            },
            {
              _id: 's2',
              chain_id: 'A',
              segid: 'DNAA',
              residues: { _id: 'r2', start: 22, stop: 42 },
              whole_segment: true
            }
          ]
        }
      ],
      rigid_bodies: [],
      chain_mol_types: [{ _id: 'm1', chain_id: 'A', mol_type: 'PRO' }]
    }
    const input = inputFromStored(fromDb, 'crd_psf')
    expect(input).toEqual({
      fixed_bodies: [
        {
          segments: [
            { segid: 'PROA', residues: { start: 40, stop: 137 } },
            { segid: 'DNAA' }
          ]
        }
      ]
    })
    const result = validateConstraintsInput(input, {
      mode: 'crd_psf',
      segments: [
        {
          segid: 'PROA',
          chain_id: 'A',
          residues: Array.from({ length: 203 }, (_, i) => i + 1)
        },
        { segid: 'DNAA', chain_id: 'A', residues: [22, 42] }
      ]
    })
    expect(result.ok).toBe(true)
  })

  it('drops only stored metadata: chain_mol_types and body names', () => {
    expect(inputFromStored(stored, 'pdb')).not.toHaveProperty('chain_mol_types')
  })

  it('keeps unexpected fields so validation rejects them', () => {
    const odd = {
      fixed_bodies: [{ segments: [{ chain_id: 'A', extra: 'system' }] }]
    }
    const result = validateConstraintsInput(inputFromStored(odd, 'pdb'), {
      mode: 'pdb',
      segments: [{ segid: 'PROA', chain_id: 'A', residues: [1, 2] }]
    })
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
      '_atom_site.auth_asym_id',
      '_atom_site.pdbx_PDB_model_num',
      'ATOM 1 CA ALA X 1 10 A 1',
      'ATOM 2 CA GLY X 2 11 A 1',
      'ATOM 3 P DA Y 1 5 B 1',
      'HETATM 4 O HOH Z . 900 W 1',
      '#'
    ].join('\n')
    expect(readCifSegments(cif)).toEqual([
      { segid: 'PROA', chain_id: 'A', mol_type: 'PRO', residues: [10, 11] },
      { segid: 'DNAB', chain_id: 'B', mol_type: 'DNA', residues: [5] }
    ])
  })
})
