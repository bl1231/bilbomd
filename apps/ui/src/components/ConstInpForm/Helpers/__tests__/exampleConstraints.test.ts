import { describe, it, expect } from 'vitest'
import { parse } from 'yaml'
import {
  importConstraintsFromConstInp,
  importConstraintsFromData,
  readPdbSegments,
  type ConstraintsInput
} from '@bilbomd/bilbomd-types'
import { EXAMPLE_CONST_INP, EXAMPLE_OPENMM_YAML } from '../exampleConstraints'

const atom = (chain: string, resSeq: number) =>
  `ATOM      1  CA  ALA ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

// A structure the example fits: protein chains A (PROA) and B (PROB)
const segments = readPdbSegments(
  [
    ...Array.from({ length: 450 }, (_, i) => atom('A', i + 1)),
    ...Array.from({ length: 600 }, (_, i) => atom('B', i + 1))
  ].join('\n')
)

const ranges = (input: ConstraintsInput | null) =>
  [...(input?.fixed_bodies ?? []), ...(input?.rigid_bodies ?? [])].map((b) =>
    b.segments.map((s) => [s.chain_id, s.residues])
  )

describe('the instructions’ example constraints files', () => {
  it('hold the same bodies, each read cleanly the way the job forms read it', () => {
    const fromInp = importConstraintsFromConstInp(EXAMPLE_CONST_INP, 'pdb', {
      structure: segments
    })
    const fromYaml = importConstraintsFromData(
      parse(EXAMPLE_OPENMM_YAML),
      'pdb',
      { structure: segments }
    )
    expect(fromInp.problems).toEqual([])
    expect(fromYaml.problems).toEqual([])
    expect(ranges(fromYaml.input)).toEqual(ranges(fromInp.input))
    expect(ranges(fromInp.input)).toEqual([
      [
        ['A', { start: 159, stop: 414 }],
        ['B', { start: 94, stop: 563 }]
      ],
      [['A', { start: 8, stop: 155 }]],
      [['B', { start: 51, stop: 79 }]]
    ])
  })

  it('writes the YAML the way BilboMD writes openmm_const.yml', () => {
    expect(EXAMPLE_OPENMM_YAML.split('\n').slice(0, 8)).toEqual([
      'constraints:',
      '  fixed_bodies:',
      '    - name: FixedBody1',
      '      segments:',
      '        - chain_id: A',
      '          residues:',
      '            start: 159',
      '            stop: 414'
    ])
  })
})
