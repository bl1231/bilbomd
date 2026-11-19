import { describe, it, expect } from 'vitest'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import { segidMolType, segmentKeys, trackMolTypes } from '../segmentKeys'

// The Classic CRD/PSF example, as its job stores it: PROA and DNAA are both
// chain A
const crdExample: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [
        { chain_id: 'A', segid: 'PROA', residues: { start: 40, stop: 137 } },
        { chain_id: 'A', segid: 'PROA', residues: { start: 150, stop: 203 } },
        {
          chain_id: 'A',
          segid: 'DNAA',
          residues: { start: 22, stop: 42 },
          whole_segment: true
        },
        {
          chain_id: 'B',
          segid: 'DNAB',
          residues: { start: 60, stop: 80 },
          whole_segment: true
        }
      ]
    }
  ],
  rigid_bodies: [],
  chain_mol_types: [
    { chain_id: 'A', mol_type: 'PRO' },
    { chain_id: 'B', mol_type: 'DNA' }
  ]
}

const pdbExample: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [
        { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 297 } },
        { chain_id: 'B', segid: 'PROB', residues: { start: 16, stop: 42 } }
      ]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [
        { chain_id: 'B', segid: 'PROB', residues: { start: 67, stop: 196 } }
      ]
    }
  ],
  chain_mol_types: [
    { chain_id: 'A', mol_type: 'PRO' },
    { chain_id: 'B', mol_type: 'PRO' }
  ]
}

describe('segmentKeys', () => {
  it('keeps chain IDs when every chain holds one segid', () => {
    const keys = segmentKeys(pdbExample)
    expect(keys.bySegid).toBe(false)
    expect(keys.keyOf({ chain_id: 'B', segid: 'PROB' })).toBe('B')
    expect(keys.labelOf('B')).toBe('Chain B')
  })

  it('keeps chain IDs for constraints stored without segids', () => {
    const keys = segmentKeys({
      fixed_bodies: [
        {
          name: 'F',
          segments: [{ chain_id: 'A', residues: { start: 1, stop: 9 } }]
        }
      ]
    })
    expect(keys.bySegid).toBe(false)
    expect(keys.keyOf({ chain_id: 'A' })).toBe('A')
  })

  it('switches every segment to its segid when two segids share a chain', () => {
    const keys = segmentKeys(crdExample)
    expect(keys.bySegid).toBe(true)
    expect(keys.keyOf({ chain_id: 'A', segid: 'PROA' })).toBe('PROA')
    expect(keys.keyOf({ chain_id: 'A', segid: 'DNAA' })).toBe('DNAA')
    // Chain B has one segid, but is named the same way
    expect(keys.keyOf({ chain_id: 'B', segid: 'DNAB' })).toBe('DNAB')
    expect(keys.labelOf('DNAB')).toBe('DNAB')
  })

  it('counts segids across fixed and rigid bodies', () => {
    const keys = segmentKeys({
      fixed_bodies: [
        {
          name: 'F',
          segments: [
            { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 9 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'R',
          segments: [
            { chain_id: 'A', segid: 'RNAA', residues: { start: 1, stop: 9 } }
          ]
        }
      ]
    })
    expect(keys.bySegid).toBe(true)
  })
})

describe('segidMolType', () => {
  it('reads pdb2crd segid prefixes', () => {
    expect(segidMolType('PROA')).toBe('PRO')
    expect(segidMolType('DNAB')).toBe('DNA')
    expect(segidMolType('RNAC')).toBe('RNA')
    expect(segidMolType('CARA')).toBe('CAR')
    expect(segidMolType('CALA')).toBe('CAR')
    expect(segidMolType('HETA')).toBeUndefined()
  })
})

describe('trackMolTypes', () => {
  it('reads types from segids when tracks are by segid', () => {
    const types = trackMolTypes(crdExample, segmentKeys(crdExample))
    expect(types).toEqual({ PROA: 'PRO', DNAA: 'DNA', DNAB: 'DNA' })
  })

  it('uses chain_mol_types by chain otherwise', () => {
    const types = trackMolTypes(pdbExample, segmentKeys(pdbExample))
    expect(types).toEqual({ A: 'PRO', B: 'PRO' })
  })

  it('gives no type for a segid without a known prefix', () => {
    const constraints: MDConstraintsDTO = {
      fixed_bodies: [
        {
          name: 'F',
          segments: [
            { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 9 } },
            { chain_id: 'A', segid: 'HETA', residues: { start: 1, stop: 1 } }
          ]
        }
      ],
      chain_mol_types: [{ chain_id: 'A', mol_type: 'PRO' }]
    }
    // Not chain A's PRO, which belongs to PROA
    expect(trackMolTypes(constraints, segmentKeys(constraints))).toEqual({
      PROA: 'PRO'
    })
  })
})
