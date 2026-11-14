import { describe, it, expect } from 'vitest'
import {
  MIN_FLEX_GAP,
  closeBodiesMessage,
  findCloseBodies
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
        'FixedBody1 (chain A 1–50) and RigidBody1 (51–80): adjacent; ' +
        'RigidBody1 (chain A 51–80) and RigidBody2 (82–90): 1 residue between. ' +
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
