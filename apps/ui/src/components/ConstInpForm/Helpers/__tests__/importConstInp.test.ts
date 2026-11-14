import { describe, it, expect } from 'vitest'
import type { Chain, RigidBody } from 'types/interfaces'
import { buildConstInp } from '../constInpText'
import { decodeSegid, importConstInp, nextRigidBodyId } from '../importConstInp'

const chain = (id: string, type: string, first = 1, last = 300): Chain => ({
  id,
  atoms: 1000,
  first_res: first,
  last_res: last,
  num_res: last - first + 1,
  type,
  domains: [{ start: first, end: last }]
})

const chains = [
  chain('A', 'PRO'),
  chain('B', 'DNA', 1, 40),
  chain('a', 'PRO', 10, 90)
]

describe('importConstInp', () => {
  it('reads back what the jiffy writes, lowercase chains included', () => {
    const bodies: RigidBody[] = [
      {
        id: 'PRIMARY',
        domains: [
          { chainid: 'A', start: 1, end: 100 },
          { chainid: 'B', start: 1, end: 40 }
        ]
      },
      {
        id: 'RIGID 1',
        domains: [
          { chainid: 'A', start: 120, end: 200 },
          { chainid: 'a', start: 20, end: 80 }
        ]
      },
      { id: 'RIGID 2', domains: [{ chainid: 'A', start: 210, end: 290 }] }
    ]
    expect(importConstInp(buildConstInp(bodies, chains), chains)).toEqual({
      rigidBodies: bodies,
      notes: []
    })
  })

  it('matches pdb2crd segids (PROa) to their chain', () => {
    const inp = `define fixed1 sele ( resid 10:50 .and. segid PROa ) end
cons fix sele fixed1 end
return`
    const { rigidBodies, notes } = importConstInp(inp, chains)!
    expect(rigidBodies).toEqual([
      { id: 'PRIMARY', domains: [{ chainid: 'a', start: 10, end: 50 }] }
    ])
    expect(notes).toEqual([])
  })

  it('drops selections on chains the PDB does not have', () => {
    const inp = `define fixed1 sele ( resid 1:100 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 1:50 .and. segid PROZ ) end
shape desc dock1 rigid sele rigid1 end
return`
    const { rigidBodies, notes } = importConstInp(inp, chains)!
    expect(rigidBodies.map((rb) => rb.id)).toEqual(['PRIMARY'])
    expect(notes).toEqual([
      'segid PROZ matches no chain in the PDB, so resid 1:50 was left out.',
      'Rigid body 1 has no segment on a chain in the PDB, so it was left out.'
    ])
  })

  it('keeps ranges outside a chain, with a note', () => {
    const inp = `define fixed1 sele ( resid 250:350 .and. segid PROA ) end
cons fix sele fixed1 end`
    const { rigidBodies, notes } = importConstInp(inp, chains)!
    expect(rigidBodies[0]?.domains).toEqual([
      { chainid: 'A', start: 250, end: 350 }
    ])
    expect(notes).toEqual([
      "resid 250:350 on chain A is outside the PDB's residues 1–300. Fix it in the next step."
    ])
  })

  it('notes a segid whose molecule type differs from the PDB chain', () => {
    const inp = `define fixed1 sele ( resid 1:20 .and. segid PROB ) end
cons fix sele fixed1 end`
    const { rigidBodies, notes } = importConstInp(inp, chains)!
    expect(rigidBodies[0]?.domains).toEqual([
      { chainid: 'B', start: 1, end: 20 }
    ])
    expect(notes).toEqual([
      'segid PROB says chain B is PRO, but in the PDB it is DNA. The new file uses DNAB.'
    ])
  })

  it('keeps a lowercase jiffy segid whose type differs from the PDB', () => {
    // Written for a protein chain 'a'; in this PDB chain 'a' is DNA
    const dnaChains = [chain('A', 'PRO'), chain('a', 'DNA', 1, 40)]
    const inp = `define fixed1 sele ( resid 1:20 .and. segid PRLA ) end
cons fix sele fixed1 end`
    expect(importConstInp(inp, dnaChains)).toEqual({
      rigidBodies: [
        { id: 'PRIMARY', domains: [{ chainid: 'a', start: 1, end: 20 }] }
      ],
      notes: [
        'segid PRLA says chain a is PRO, but in the PDB it is DNA. The new file uses DNLA.'
      ]
    })
  })

  it('merges several cons fix commands into PRIMARY', () => {
    const inp = `define fixed1 sele ( resid 1:100 .and. segid PROA ) end
cons fix sele fixed1 end
define fixed2 sele ( resid 1:40 .and. segid DNAB ) end
cons fix sele fixed2 end`
    const { rigidBodies, notes } = importConstInp(inp, chains)!
    expect(rigidBodies[0]?.domains).toHaveLength(2)
    expect(notes).toEqual([
      "The file has 2 'cons fix' commands. All their segments were put in the PRIMARY (fixed) body."
    ])
  })

  it('says what it could not read', () => {
    const inp = `define fixed1 sele ( resid 1:100 .and. segid PROA ) end
define rigid1 sele ( resid 120:200 .and. segid PROA ) end
cons harm force 5.0 sele fixed1 end
shape desc dock1 rigid sele rigid1 .or. rigid9 end
return`
    expect(importConstInp(inp, chains)).toEqual({
      rigidBodies: [
        { id: 'PRIMARY', domains: [] },
        { id: 'RIGID 1', domains: [{ chainid: 'A', start: 120, end: 200 }] }
      ],
      notes: [
        'No fixed segments were imported. Add at least one to PRIMARY in the next step.',
        "Not imported (the jiffy can't read this command): cons harm force 5.0 sele fixed1 end",
        "'rigid9' is used before any define sets it, so it was ignored."
      ]
    })
  })

  it('reads whole segments, single residues and segid lists', () => {
    const glycoChains = [
      chain('A', 'PRO', 2, 344),
      chain('B', 'CAR', 1, 2),
      chain('C', 'CAR', 1, 3),
      chain('D', 'CAR', 1, 1)
    ]
    const inp = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
define fixed2 sele ( segid CARB .or. segid CARC ) end
define fixed3 sele ( resid 1 .and. segid CARD ) end
define fixed4 sele ( segid HETA ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 .or. fixed4 end
return`
    expect(importConstInp(inp, glycoChains)).toEqual({
      rigidBodies: [
        {
          id: 'PRIMARY',
          domains: [
            { chainid: 'A', start: 2, end: 344 },
            { chainid: 'B', start: 1, end: 2 },
            { chainid: 'C', start: 1, end: 3 },
            { chainid: 'D', start: 1, end: 1 }
          ]
        }
      ],
      notes: [
        'segid HETA matches no chain in the PDB, so the whole segment was left out.'
      ]
    })
  })

  it('returns null for a file with no fixed or rigid body', () => {
    expect(
      importConstInp('cons harm force 5.0 sele all end\nreturn', chains)
    ).toBeNull()
    expect(importConstInp('', chains)).toBeNull()
  })
})

describe('nextRigidBodyId', () => {
  it('counts up from the highest RIGID number', () => {
    expect(nextRigidBodyId([{ id: 'PRIMARY', domains: [] }])).toBe('RIGID 1')
    expect(
      nextRigidBodyId([
        { id: 'PRIMARY', domains: [] },
        { id: 'RIGID 3', domains: [] }
      ])
    ).toBe('RIGID 4')
  })

  it('does not reuse an ID after a body is deleted', () => {
    // RIGID 1 deleted, RIGID 2 kept
    expect(
      nextRigidBodyId([
        { id: 'PRIMARY', domains: [] },
        { id: 'RIGID 2', domains: [] }
      ])
    ).toBe('RIGID 3')
  })
})

describe('decodeSegid', () => {
  it('reads the chain ID and type from each segid form', () => {
    expect(decodeSegid('PROA')).toEqual({ chainId: 'A', type: 'PRO' })
    expect(decodeSegid('PROa')).toEqual({ chainId: 'a', type: 'PRO' })
    expect(decodeSegid('PRLA')).toEqual({ chainId: 'a', type: 'PRO' })
    expect(decodeSegid('DNLB')).toEqual({ chainId: 'b', type: 'DNA' })
    expect(decodeSegid('RNAC')).toEqual({ chainId: 'C', type: 'RNA' })
    expect(decodeSegid('CARG')).toEqual({ chainId: 'G', type: 'CAR' })
    expect(decodeSegid('CALG')).toEqual({ chainId: 'g', type: 'CAR' })
  })

  it('returns null for other segids', () => {
    expect(decodeSegid('HETA')).toBeNull()
    expect(decodeSegid('OTHERA')).toBeNull()
    expect(decodeSegid('PRO')).toBeNull()
  })
})
