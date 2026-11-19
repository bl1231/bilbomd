import { describe, it, expect } from 'vitest'
import { stringify } from 'yaml'
import type { StructureSegment } from '@bilbomd/bilbomd-types'
import type { Chain } from 'types/interfaces'
import {
  constraintsFileProblem,
  importJiffyFile,
  isDataFile
} from '../importJiffyFile'

const chain = (id: string, type: string, first = 1, last = 300): Chain => ({
  id,
  atoms: 1000,
  first_res: first,
  last_res: last,
  num_res: last - first + 1,
  type,
  domains: [{ start: first, end: last }]
})

const chains = [chain('A', 'PRO'), chain('B', 'DNA', 1, 40)]

const residues = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i)
const segment = (
  segid: string,
  chain_id: string,
  first: number,
  last: number
): StructureSegment => ({ segid, chain_id, residues: residues(first, last) })

// As BilboMD builds the PDB above
const segments = [segment('PROA', 'A', 1, 300), segment('DNAB', 'B', 1, 40)]

// As BilboMD writes openmm_const.yml for an OpenMM job
const openmmYaml = stringify({
  constraints: {
    fixed_bodies: [
      {
        name: 'FixedBody1',
        segments: [{ chain_id: 'A', residues: { start: 1, stop: 120 } }]
      }
    ],
    rigid_bodies: [
      {
        name: 'RigidBody1',
        segments: [{ chain_id: 'A', residues: { start: 150, stop: 280 } }]
      },
      {
        name: 'RigidBody2',
        segments: [{ chain_id: 'B', residues: { start: 1, stop: 40 } }]
      }
    ]
  }
})

describe('isDataFile', () => {
  it('goes by the extension', () => {
    expect(isDataFile('openmm_const.yml')).toBe(true)
    expect(isDataFile('openmm_config.YAML')).toBe(true)
    expect(isDataFile('bilbomd_job.json')).toBe(true)
    expect(isDataFile('const.inp')).toBe(false)
    expect(isDataFile('constraints.txt')).toBe(false)
  })
})

describe('importJiffyFile', () => {
  it('reads an OpenMM constraints YAML into PRIMARY and RIGID bodies', () => {
    const imported = importJiffyFile(
      openmmYaml,
      'openmm_const.yml',
      chains,
      segments
    )
    expect(imported).toEqual({
      rigidBodies: [
        { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 120 }] },
        { id: 'RIGID 1', domains: [{ chainid: 'A', start: 150, end: 280 }] },
        { id: 'RIGID 2', domains: [{ chainid: 'B', start: 1, end: 40 }] }
      ],
      notes: []
    })
  })

  it("reads bilbomd_job.json's md_constraints, a whole segment as the whole chain", () => {
    const json = JSON.stringify({
      md_constraints: {
        fixed_bodies: [
          {
            name: 'FixedBody1',
            segments: [
              {
                chain_id: 'A',
                segid: 'PROA',
                residues: { start: 1, stop: 300 }
              }
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
                residues: { start: 1, stop: 40 },
                whole_segment: true
              }
            ]
          }
        ],
        chain_mol_types: [{ chain_id: 'A', mol_type: 'PRO' }]
      }
    })
    const imported = importJiffyFile(json, 'bilbomd_job.json', chains, segments)
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 300 }] },
      { id: 'RIGID 1', domains: [{ chainid: 'B', start: 1, end: 40 }] }
    ])
    expect(imported?.notes).toEqual([])
  })

  it('drops segments on chains the PDB lacks, fitting a range to its segment', () => {
    const yaml = stringify({
      fixed_bodies: [
        {
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 350 } },
            { chain_id: 'C', residues: { start: 1, stop: 10 } }
          ]
        }
      ],
      rigid_bodies: [
        { segments: [{ chain_id: 'D', residues: { start: 5, stop: 9 } }] }
      ]
    })
    const imported = importJiffyFile(yaml, 'constraints.yaml', chains, segments)
    // Fitted to PROA's residues, as the job forms read it
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 300 }] }
    ])
    expect(imported?.notes).toEqual([
      'Chain C is not in the PDB, so residues 1–10 was left out.',
      'Chain D is not in the PDB, so residues 5–9 was left out.',
      'Rigid body 1 has no segment on a chain in the PDB, so it was left out.'
    ])
  })

  it('notes fields it leaves out', () => {
    const json = JSON.stringify({
      fixed_bodies: [
        { segments: [{ chain_id: 'A', residues: { start: 1, stop: 9 }, x: 1 }] }
      ]
    })
    const imported = importJiffyFile(json, 'c.json', chains, segments)
    expect(imported?.notes.join(' ')).toContain(
      'Not imported: Fixed body 1, segment 1: left out field "x"'
    )
  })

  it('is null for unreadable YAML or a file with no fixed body', () => {
    expect(importJiffyFile('a: [', 'bad.yml', chains, segments)).toBeNull()
    expect(
      importJiffyFile('{"rigid_bodies": []}', 'c.json', chains, segments)
    ).toBeNull()
  })

  it('reads a segid-only selection as the chain BilboMD builds it on', () => {
    // Protein chain a is segment PROA, since DNA chain A is DNAA
    const mixedChains = [chain('a', 'PRO', 1, 100), chain('A', 'DNA', 1, 30)]
    const mixed = [segment('PROA', 'a', 1, 100), segment('DNAA', 'A', 1, 30)]
    const imported = importJiffyFile(
      JSON.stringify({ fixed_bodies: [{ segments: [{ segid: 'PROA' }] }] }),
      'c.json',
      mixedChains,
      mixed
    )
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'a', start: 1, end: 100 }] }
    ])
    expect(imported?.notes).toEqual([])
  })

  it('keeps a whole segment to its own bounds when its chain has others', () => {
    // Chain A built as two segments, e.g. across a chain break
    const split = [segment('PROA', 'A', 1, 123), segment('PROB', 'A', 130, 203)]
    const imported = importJiffyFile(
      JSON.stringify({
        md_constraints: {
          fixed_bodies: [
            {
              segments: [
                {
                  chain_id: 'A',
                  segid: 'PROA',
                  residues: { start: 1, stop: 123 },
                  whole_segment: true
                }
              ]
            }
          ],
          rigid_bodies: [
            {
              segments: [
                {
                  chain_id: 'A',
                  segid: 'PROB',
                  residues: { start: 130, stop: 203 },
                  whole_segment: true
                }
              ]
            }
          ]
        }
      }),
      'bilbomd_job.json',
      [chain('A', 'PRO', 1, 203)],
      split
    )
    // Not A 1–203 for both, which would overlap
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 123 }] },
      { id: 'RIGID 1', domains: [{ chainid: 'A', start: 130, end: 203 }] }
    ])
    expect(imported?.notes).toEqual([])
  })

  it('notes a selection whose residue numbers another segment of its chain uses', () => {
    // Two molecules sharing chain A and its numbering
    const shared = [segment('PROA', 'A', 1, 50), segment('PROB', 'A', 1, 50)]
    const imported = importJiffyFile(
      JSON.stringify({
        fixed_bodies: [{ segments: [{ chain_id: 'A', segid: 'PROA' }] }]
      }),
      'c.json',
      [chain('A', 'PRO', 1, 50)],
      shared
    )
    expect(imported?.rigidBodies[0]?.domains).toEqual([
      { chainid: 'A', start: 1, end: 50 }
    ])
    expect(imported?.notes).toEqual([
      'PROA 1–50 shares residue numbers on chain A with PROB. The jiffy selects by chain and residue number, so this selection covers both. Check it in the next step.'
    ])
  })

  it('leaves out a segid the PDB does not have, instead of guessing its chain', () => {
    const imported = importJiffyFile(
      JSON.stringify({
        fixed_bodies: [{ segments: [{ segid: 'PROA' }, { segid: 'PROC' }] }]
      }),
      'c.json',
      chains,
      segments
    )
    expect(imported?.rigidBodies[0]?.domains).toEqual([
      { chainid: 'A', start: 1, end: 300 }
    ])
    expect(imported?.notes).toEqual([
      'Not imported: Fixed body 1, segment 2: segid PROC is not in the structure, so the segment was left out'
    ])
  })

  it('still reads a const.inp the way it did', () => {
    const imported = importJiffyFile(
      [
        'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'return'
      ].join('\n'),
      'const.inp',
      chains,
      segments
    )
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }
    ])
  })
})

describe('constraintsFileProblem', () => {
  it('accepts files it can start from', () => {
    expect(constraintsFileProblem(openmmYaml, 'openmm_const.yml')).toBeNull()
    expect(
      constraintsFileProblem(
        'define f sele ( segid PROA ) end\ncons fix sele f end\nreturn',
        'const.inp'
      )
    ).toBeNull()
  })

  it('says why it cannot start from a file', () => {
    expect(constraintsFileProblem('a: [', 'bad.yml')).toBe(
      'The file could not be read as YAML or JSON.'
    )
    expect(constraintsFileProblem('{}', 'c.json')).toBe(
      'No fixed body could be read from this file.'
    )
    expect(constraintsFileProblem('return', 'const.inp')).toBe(
      'No fixed or rigid bodies could be read from this file.'
    )
  })
})
