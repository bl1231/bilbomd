import { describe, it, expect } from 'vitest'
import type { Chain } from 'types/interfaces'
import { buildConstInp, jiffySegid } from '../constInpText'

const chain = (id: string, type: string, last = 300): Chain => ({
  id,
  atoms: 1000,
  first_res: 1,
  last_res: last,
  num_res: last,
  type,
  domains: [{ start: 1, end: last }]
})

const chains = [chain('A', 'PRO'), chain('B', 'DNA', 40), chain('a', 'PRO')]

describe('jiffySegid', () => {
  it('joins the molecule type and chain ID', () => {
    expect(jiffySegid('A', chains)).toBe('PROA')
    expect(jiffySegid('B', chains)).toBe('DNAB')
  })

  it("marks a lowercase chain with 'L' and uppercases it", () => {
    expect(jiffySegid('a', chains)).toBe('PRLA')
  })
})

describe('buildConstInp', () => {
  it('writes PRIMARY as cons fix and each other body as a shape', () => {
    const text = buildConstInp(
      [
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
            { chainid: 'a', start: 5, end: 50 }
          ]
        },
        { id: 'RIGID 2', domains: [{ chainid: 'A', start: 210, end: 290 }] }
      ],
      chains
    )
    expect(text).toBe(
      [
        'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
        'define fixed2 sele ( resid 1:40 .and. segid DNAB ) end',
        'cons fix sele fixed1 .or. fixed2 end',
        ' ',
        'define rigid1 sele ( resid 120:200 .and. segid PROA ) end',
        'define rigid2 sele ( resid 5:50 .and. segid PRLA ) end',
        'shape desc dock1 rigid sele rigid1 .or. rigid2 end',
        ' ',
        'define rigid3 sele ( resid 210:290 .and. segid PROA ) end',
        'shape desc dock2 rigid sele rigid3 end',
        ' ',
        'return'
      ].join('\n')
    )
  })

  it('writes just return when there are no bodies', () => {
    expect(buildConstInp([], chains)).toBe('return')
  })
})
