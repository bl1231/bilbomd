import { describe, it, expect } from 'vitest'
import {
  parseConstInp,
  readConstInp,
  segidToChainId
} from '../constInpParser.js'

describe('segidToChainId', () => {
  it('strips the pdb2crd molecule-type prefix', () => {
    expect(segidToChainId('PROA')).toBe('A')
    expect(segidToChainId('DNAD')).toBe('D')
    expect(segidToChainId('RNAB')).toBe('B')
    expect(segidToChainId('CARG')).toBe('G')
    expect(segidToChainId('CALg')).toBe('g')
  })

  it('keeps a segid with no known prefix, or nothing after it', () => {
    expect(segidToChainId('XYZ1')).toBe('XYZ1')
    expect(segidToChainId('PRO')).toBe('PRO')
  })
})

describe('parseConstInp', () => {
  it('reads fixed and rigid bodies with multiple segments and chains', () => {
    const inp = `define fixed1 sele ( resid 1:150 .and. segid PROA ) end
define fixed2 sele ( resid 160:170 .and. segid DNAB ) end
cons fix sele fixed1 .or. fixed2 end

define rigid1 sele ( resid 171:290 .and. segid PROA ) end
define rigid2 sele ( resid 20:95 .and. segid PROC ) end
shape desc dock1 rigid sele rigid1 .or. rigid2 end
return
`
    expect(parseConstInp(inp)).toEqual({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 150 } },
            { chain_id: 'B', residues: { start: 160, stop: 170 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'RigidBody1',
          segments: [
            { chain_id: 'A', residues: { start: 171, stop: 290 } },
            { chain_id: 'C', residues: { start: 20, stop: 95 } }
          ]
        }
      ]
    })
  })

  it('uses each define as it stands at the line that uses it (#1281)', () => {
    const inp = `define rigid1 sele ( resid 10:20 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
define rigid1 sele ( resid 30:40 .and. segid PROA ) end
shape desc dock2 rigid sele rigid1 end
`
    const { rigid_bodies } = parseConstInp(inp)
    expect(rigid_bodies?.map((b) => b.segments[0]?.residues)).toEqual([
      { start: 10, stop: 20 },
      { start: 30, stop: 40 }
    ])
    expect(rigid_bodies?.map((b) => b.name)).toEqual([
      'RigidBody1',
      'RigidBody2'
    ])
  })

  it('joins continuation lines and ignores comments', () => {
    const inp = `! a comment with define x sele ( resid 1:2 .and. segid PROA ) end
define fixed1 sele ( resid 1:5 .and. segid PROA ) end
define fixed2 sele ( resid 8:12 .and. segid PROA ) end
cons fix sele fixed1 -
 .or. fixed2 end ! trailing end
`
    const { fixed_bodies } = parseConstInp(inp)
    expect(fixed_bodies).toHaveLength(1)
    expect(fixed_bodies?.[0]?.segments).toHaveLength(2)
  })

  it('skips bodies whose selection names nothing defined', () => {
    const inp = `cons fix sele missing end
shape desc dock1 rigid sele nothing end
`
    expect(parseConstInp(inp)).toEqual({ fixed_bodies: [], rigid_bodies: [] })
  })

  it('returns empty lists for an empty file', () => {
    expect(parseConstInp('')).toEqual({ fixed_bodies: [], rigid_bodies: [] })
  })
})

describe('readConstInp', () => {
  const range = (segid: string, start: number, stop: number) => ({
    segid,
    residues: { start, stop }
  })
  const whole = (segid: string) => ({ segid, residues: null })

  it('keeps each selection segid as written', () => {
    const inp = `define fixed1 sele ( resid 1:150 .and. segid PRLA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 171:290 .and. segid DNAB ) end
shape desc dock1 rigid sele rigid1 end
return
`
    expect(readConstInp(inp)).toEqual({
      fixed_bodies: [
        { name: 'FixedBody1', selections: [range('PRLA', 1, 150)] }
      ],
      rigid_bodies: [
        { name: 'RigidBody1', selections: [range('DNAB', 171, 290)] }
      ],
      skipped: [],
      undefined_names: []
    })
  })

  it('reads single residues, whole segments and segid lists', () => {
    const inp = `define fixed1 sele ( resid 226:870 .and. segid PROA)  end
define fixed2 sele ( resid 1 .and. segid CARA ) end
define fixed3 sele ( segid HETB ) end
define fixed4 sele ( segid CARB .or. segid CARC .or. segid CARD ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 .or. -
fixed4 end
return
`
    const { fixed_bodies, skipped } = readConstInp(inp)
    expect(skipped).toEqual([])
    expect(fixed_bodies[0]?.selections).toEqual([
      range('PROA', 226, 870),
      range('CARA', 1, 1),
      whole('HETB'),
      whole('CARB'),
      whole('CARC'),
      whole('CARD')
    ])
  })

  it('reads one range on several segids, in either order', () => {
    const inp = `define fixed1 sele ( resid 10:20 .and. ( segid PROA .or. segid PROB ) ) end
define rigid1 sele ( segid PROC .and. resid 5:9 ) end
cons fix sele fixed1 end
shape desc dock1 rigid sele rigid1 end
`
    const { fixed_bodies, rigid_bodies } = readConstInp(inp)
    expect(fixed_bodies[0]?.selections).toEqual([
      range('PROA', 10, 20),
      range('PROB', 10, 20)
    ])
    expect(rigid_bodies[0]?.selections).toEqual([range('PROC', 5, 9)])
  })

  it('reads parenthesised alternatives, any case and abbreviations', () => {
    const inp = `DEFINE fixed1 SELE ( RESI 1:5 .AND. SEGI PROA ) .or. ( resid 8:9 .and. segid PROB ) END
CONS FIX SELE fixed1 END
`
    expect(readConstInp(inp).fixed_bodies[0]?.selections).toEqual([
      range('PROA', 1, 5),
      range('PROB', 8, 9)
    ])
  })

  it('reports selections it cannot read, but not titles or comments', () => {
    const inp = `* a title line
! just a comment
define fixed1 sele ( resid 1:20 ) end
define fixed2 sele ( resid 1:5 .and. segid PROA .or. segid PROB ) end
define fixed3 sele ( type CA .and. segid PROA ) end
cons harm force 10.0 sele fixed1 end
define fixed4 sele ( resid 30:40 .and. segid PROA ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 .or. fixed4 end
return
`
    const { skipped, fixed_bodies, undefined_names } = readConstInp(inp)
    expect(skipped).toEqual([
      'define fixed1 sele ( resid 1:20 ) end',
      'define fixed2 sele ( resid 1:5 .and. segid PROA .or. segid PROB ) end',
      'define fixed3 sele ( type CA .and. segid PROA ) end',
      'cons harm force 10.0 sele fixed1 end'
    ])
    // The unreadable defines are reported once, as skipped lines
    expect(undefined_names).toEqual([])
    expect(fixed_bodies[0]?.selections).toEqual([range('PROA', 30, 40)])
  })

  it('forgets a name redefined with a selection it cannot read', () => {
    const inp = `define rigid1 sele ( resid 1:5 .and. segid PROA ) end
define rigid1 sele ( type CA ) end
shape desc dock1 rigid sele rigid1 end
`
    const { rigid_bodies, skipped } = readConstInp(inp)
    expect(rigid_bodies).toEqual([])
    expect(skipped).toEqual(['define rigid1 sele ( type CA ) end'])
  })

  it('reports names used before any define sets them', () => {
    const inp = `define rigid1 sele ( resid 1:5 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 .or. rigid2 end
cons fix sele missing end
`
    const { rigid_bodies, undefined_names } = readConstInp(inp)
    expect(rigid_bodies[0]?.selections).toHaveLength(1)
    expect(undefined_names).toEqual(['rigid2', 'missing'])
  })
})

describe('parseConstInp keeps to the defines it has always read', () => {
  it('leaves out single residues, whole segments and segid lists', () => {
    const inp = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
define fixed2 sele ( segid CARB .or. segid CARC ) end
define fixed3 sele ( resid 1 .and. segid CARD ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 end
define rigid1 sele ( segid HETA ) end
shape desc dock1 rigid sele rigid1 end
return
`
    expect(parseConstInp(inp)).toEqual({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [{ chain_id: 'A', residues: { start: 2, stop: 344 } }]
        }
      ],
      rigid_bodies: []
    })
  })

  it('keeps an earlier define when a name is redefined in another form', () => {
    const inp = `define rigid1 sele ( resid 1:5 .and. segid PROA ) end
define rigid1 sele ( segid PROB ) end
shape desc dock1 rigid sele rigid1 end
`
    expect(parseConstInp(inp).rigid_bodies).toEqual([
      {
        name: 'RigidBody1',
        segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }]
      }
    ])
  })
})
