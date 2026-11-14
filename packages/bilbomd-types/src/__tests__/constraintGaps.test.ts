import { describe, it, expect } from 'vitest'
import {
  MIN_FLEX_GAP,
  closeBodiesMessage,
  constInpCloseBodiesMessage,
  constInpOverlapMessage,
  findCloseBodies,
  findConstInpOverlaps
} from '../constraintGaps.js'
import type { MDConstraintsDTO } from '../jobs/mdConstraints.js'

const seg = (chain_id: string, start: number, stop: number) => ({
  chain_id,
  residues: { start, stop }
})

const constraints = (
  fixed: ReturnType<typeof seg>[][],
  rigid: ReturnType<typeof seg>[][]
): MDConstraintsDTO => ({
  fixed_bodies: fixed.map((segments, i) => ({
    name: `FixedBody${i + 1}`,
    segments
  })),
  rigid_bodies: rigid.map((segments, i) => ({
    name: `RigidBody${i + 1}`,
    segments
  }))
})

describe('findCloseBodies', () => {
  it('matches the gap pae2const.py enforces', () => {
    expect(MIN_FLEX_GAP).toBe(2)
  })

  it('finds adjacent and one-residue gaps between fixed and rigid', () => {
    const c = constraints(
      [[seg('A', 1, 50)]],
      [[seg('A', 51, 80)], [seg('A', 82, 90)], [seg('A', 93, 120)]]
    )
    expect(findCloseBodies(c)).toEqual([
      {
        first: 'FixedBody1',
        second: 'RigidBody1',
        chain_id: 'A',
        gap: 0,
        first_range: '1–50',
        second_range: '51–80'
      },
      {
        first: 'RigidBody1',
        second: 'RigidBody2',
        chain_id: 'A',
        gap: 1,
        first_range: '51–80',
        second_range: '82–90'
      }
    ])
  })

  it('orders each pair by position, whichever body comes first', () => {
    const c = constraints([[seg('A', 60, 90)]], [[seg('A', 10, 59)]])
    expect(findCloseBodies(c)).toMatchObject([
      { first: 'RigidBody1', second: 'FixedBody1', gap: 0 }
    ])
  })

  it('ignores fixed↔fixed, the same body, other chains and overlaps', () => {
    const c = constraints(
      [[seg('A', 1, 10)], [seg('A', 11, 20)]],
      [
        [seg('A', 30, 40), seg('A', 41, 50)],
        [seg('B', 51, 60)],
        [seg('A', 45, 70)]
      ]
    )
    expect(findCloseBodies(c)).toEqual([])
  })

  it('takes another minimum', () => {
    const c = constraints([[seg('A', 1, 50)]], [[seg('A', 54, 80)]])
    expect(findCloseBodies(c)).toEqual([])
    expect(findCloseBodies(c, 4)).toMatchObject([{ gap: 3 }])
  })
})

describe('closeBodiesMessage', () => {
  it('names each pair and says the job can still be submitted', () => {
    const message = closeBodiesMessage(
      constraints([[seg('A', 1, 50)]], [[seg('A', 51, 80)], [seg('A', 82, 90)]])
    )
    expect(message).toBe(
      'Some bodies have fewer than 2 flexible residues between them: ' +
        'FixedBody1 (A 1–50) and RigidBody1 (51–80): adjacent; ' +
        'RigidBody1 (A 51–80) and RigidBody2 (82–90): 1 residue between. ' +
        'Leaving at least 2 flexible residues between bodies gives the linker ' +
        'room to move. You can still submit.'
    )
  })

  it('is null when every pair has room', () => {
    expect(
      closeBodiesMessage(constraints([[seg('A', 1, 50)]], [[seg('A', 53, 80)]]))
    ).toBeNull()
  })
})

describe('findConstInpOverlaps', () => {
  it('finds fixed/rigid overlaps in every selection form', () => {
    const inp = `define fixed1 sele ( resid 1 .and. segid PROA ) end
define fixed2 sele ( segid PROB .and. resid 1:50 ) end
cons fix sele fixed1 .or. fixed2 end
define rigid1 sele ( resid 1:10 .and. segid PROA ) end
define rigid2 sele ( resid 40:60 .and. segid PROB ) end
shape desc dock1 rigid sele rigid1 .or. rigid2 end
return`
    expect(findConstInpOverlaps(inp)).toEqual([
      'FixedBody1 and RigidBody1 both include segid PROA residues 1-1',
      'FixedBody1 and RigidBody1 both include segid PROB residues 40-50'
    ])
  })

  it('treats a whole-segment selection as covering the segment', () => {
    const inp = `define fixed1 sele ( segid DNAD ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 30:40 .and. segid DNAD ) end
shape desc dock1 rigid sele rigid1 end`
    expect(findConstInpOverlaps(inp)).toEqual([
      'FixedBody1 and RigidBody1 both include segid DNAD'
    ])
  })

  it('keeps segids apart: carbohydrate CARA is not protein chain A', () => {
    const inp = `define fixed1 sele ( resid 1:20 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 1 .and. segid CARA ) end
shape desc dock1 rigid sele rigid1 end`
    expect(findConstInpOverlaps(inp)).toEqual([])
  })

  it('allows two fixed bodies, or segments of one body, to share residues', () => {
    const inp = `define fixed1 sele ( resid 1:20 .and. segid PROA ) end
define fixed2 sele ( resid 10:30 .and. segid PROA ) end
cons fix sele fixed1 end
cons fix sele fixed2 end
define rigid1 sele ( resid 40:50 .and. segid PROA ) end
define rigid2 sele ( resid 45:60 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 .or. rigid2 end`
    expect(findConstInpOverlaps(inp)).toEqual([])
  })

  it('names the overlaps in its message', () => {
    expect(
      constInpOverlapMessage(`define rigid1 sele ( resid 1:20 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
define rigid2 sele ( resid 15:30 .and. segid PROA ) end
shape desc dock2 rigid sele rigid2 end`)
    ).toContain(
      'Constraint bodies must not overlap: RigidBody1 and RigidBody2 both include segid PROA residues 15-20.'
    )
    expect(
      constInpOverlapMessage(`define fixed1 sele ( resid 1:20 .and. segid PROA ) end
cons fix sele fixed1 end`)
    ).toBeNull()
  })
})

describe('constInpCloseBodiesMessage', () => {
  it('measures the forms parseConstInp skips, by segid', () => {
    const inp = `define fixed1 sele ( segid PROA .and. resid 1:50 ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 51 .and. segid PROA ) end
define rigid2 sele ( resid 52:60 .and. segid CARA ) end
shape desc dock1 rigid sele rigid1 end
shape desc dock2 rigid sele rigid2 end`
    expect(constInpCloseBodiesMessage(inp)).toContain(
      'FixedBody1 (PROA 1–50) and RigidBody1 (51–51): adjacent.'
    )
    expect(constInpCloseBodiesMessage(inp)).not.toContain('CARA')
  })

  it('leaves out whole-segment selections, which have no range', () => {
    const inp = `define fixed1 sele ( segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 51:60 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end`
    expect(constInpCloseBodiesMessage(inp)).toBeNull()
  })
})
