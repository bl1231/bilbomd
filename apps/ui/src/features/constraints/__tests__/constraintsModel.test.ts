import { describe, it, expect } from 'vitest'
import {
  validateConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import {
  defaultConstraints,
  describeSegment,
  segmentOf
} from '../constraintsModel'

// Chain D is two separate DNA strands, so pdb2crd builds two segments
const segments: StructureSegment[] = [
  { segid: 'PROP', chain_id: 'P', mol_type: 'PRO', residues: [1, 2, 3] },
  { segid: 'DNAD', chain_id: 'D', mol_type: 'DNA', residues: [22, 23, 24] },
  { segid: 'DNAB', chain_id: 'D', mol_type: 'DNA', residues: [60, 61, 62] }
]

describe('constraintsModel with a chain that is two segments', () => {
  it('names each segment by segid, so the default constraints validate', () => {
    const input = defaultConstraints('pdb', segments)
    expect(input.fixed_bodies[0]?.segments).toEqual([
      { chain_id: 'P', segid: 'PROP' },
      { chain_id: 'D', segid: 'DNAD' },
      { chain_id: 'D', segid: 'DNAB' }
    ])
    const result = validateConstraintsInput(input, { mode: 'pdb', segments })
    expect(result.ok).toBe(true)
  })

  it('finds the segment a value names', () => {
    expect(segmentOf(segments, { chain_id: 'D', segid: 'DNAB' })).toBe(
      segments[2]
    )
    // Input without a segid (older saved input) picks the chain's first
    expect(segmentOf(segments, { chain_id: 'D' })).toBe(segments[1])
  })

  it('shows the segid in the label, so the two strands can be told apart', () => {
    expect(describeSegment('pdb', segments[2]!)).toBe(
      'Chain D (DNAB) · DNA · residues 60–62'
    )
  })
})
