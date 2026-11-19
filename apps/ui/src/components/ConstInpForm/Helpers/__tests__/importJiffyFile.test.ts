import { describe, it, expect } from 'vitest'
import { stringify } from 'yaml'
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
    const imported = importJiffyFile(openmmYaml, 'openmm_const.yml', chains)
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
    const imported = importJiffyFile(json, 'bilbomd_job.json', chains)
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 300 }] },
      { id: 'RIGID 1', domains: [{ chainid: 'B', start: 1, end: 40 }] }
    ])
    expect(imported?.notes).toEqual([])
  })

  it('drops segments on chains the PDB lacks and flags ranges outside a chain', () => {
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
    const imported = importJiffyFile(yaml, 'constraints.yaml', chains)
    expect(imported?.rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 350 }] }
    ])
    expect(imported?.notes).toEqual([
      "Residues 1–350 on chain A are outside the PDB's residues 1–300. Fix them in the next step.",
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
    const imported = importJiffyFile(json, 'c.json', chains)
    expect(imported?.notes.join(' ')).toContain(
      'Not imported: Fixed body 1, segment 1: left out field "x"'
    )
  })

  it('is null for unreadable YAML or a file with no fixed body', () => {
    expect(importJiffyFile('a: [', 'bad.yml', chains)).toBeNull()
    expect(importJiffyFile('{"rigid_bodies": []}', 'c.json', chains)).toBeNull()
  })

  it('still reads a const.inp the way it did', () => {
    const imported = importJiffyFile(
      [
        'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'return'
      ].join('\n'),
      'const.inp',
      chains
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
