import { describe, it, expect } from 'vitest'
import type { AlignmentReport } from 'features/jobdetail/rigidDomains'
import { alignmentDomainColoring } from '../domainColoring'

const report = {
  method: 'rigid-domain',
  domains: [
    { id: 1, size: 296, residues: ['A:2-13', 'A:22-90', 'B:19-37'] },
    { id: 2, size: 123, residues: ['B:69-77', 'B:126-126'] }
  ]
} as unknown as AlignmentReport

describe('alignmentDomainColoring', () => {
  it('makes the anchor the fixed body and the other domains rigid bodies', () => {
    expect(alignmentDomainColoring(report)).toEqual({
      fixed_bodies: [
        {
          name: 'domain-1',
          color: 0x2a78d6, // the Rigid Domains tab's domain 1 blue
          segments: [
            { chain_id: 'A', residues: { start: 2, stop: 13 } },
            { chain_id: 'A', residues: { start: 22, stop: 90 } },
            { chain_id: 'B', residues: { start: 19, stop: 37 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'domain-2',
          color: 0xeb6834,
          segments: [
            { chain_id: 'B', residues: { start: 69, stop: 77 } },
            { chain_id: 'B', residues: { start: 126, stop: 126 } }
          ]
        }
      ]
    })
  })

  it('gives each further domain its own color', () => {
    const three = {
      ...report,
      domains: [...report.domains, { id: 3, size: 30, residues: ['C:1-30'] }]
    } as AlignmentReport
    const colors = alignmentDomainColoring(three)?.rigid_bodies?.map(
      (b) => b.color
    )
    expect(colors).toEqual([0xeb6834, 0x1baf7a])
  })

  it('reads negative residue numbers', () => {
    const neg = {
      ...report,
      domains: [{ id: 1, size: 9, residues: ['A:-5-3'] }]
    } as AlignmentReport
    expect(alignmentDomainColoring(neg)?.fixed_bodies?.[0]?.segments).toEqual([
      { chain_id: 'A', residues: { start: -5, stop: 3 } }
    ])
  })

  it('is undefined when there is nothing to color by', () => {
    expect(alignmentDomainColoring(undefined)).toBeUndefined()
    expect(
      alignmentDomainColoring({
        ...report,
        method: 'all-residues',
        domains: []
      } as AlignmentReport)
    ).toBeUndefined()
    expect(
      alignmentDomainColoring({ ...report, domains: [] } as AlignmentReport)
    ).toBeUndefined()
  })
})
