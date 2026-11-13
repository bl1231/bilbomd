import { describe, it, expect } from 'vitest'
import {
  findOpenMMIgnoredConstInpLines,
  findSingleResidueFixedSegments,
  openmmConstInpMessage
} from '../openmmConstInpChecks.js'
import { wrapConstInpCommand } from '../structureFileChecks.js'

describe('findOpenMMIgnoredConstInpLines', () => {
  it('passes a file in the form OpenMM reads', () => {
    const inp = `* title
! comment
define fixed1 sele ( resid 1:100 .and. segid PROA ) end
define fixed2 sele ( resid 1:40 .and. segid DNAB ) end
cons fix sele fixed1 .or. fixed2 end

define rigid1 sele ( resid 120:200 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
return
`
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([])
    expect(openmmConstInpMessage(inp)).toBeNull()
  })

  it('passes long commands the Inp Jiffy wraps over several lines', () => {
    const names = Array.from({ length: 30 }, (_, i) => `fixed${i + 1}`)
    const inp = [
      ...names.map(
        (name, i) =>
          `define ${name} sele ( resid ${i * 10 + 1}:${i * 10 + 5} .and. segid PROA ) end`
      ),
      ...wrapConstInpCommand(`cons fix sele ${names.join(' .or. ')} end`),
      'return'
    ].join('\n')
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([])
  })

  it('lists defines in other forms and the commands that use them', () => {
    const inp = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
define fixed2 sele ( segid CARB .or. segid CARC ) end
define fixed3 sele ( resid 1 .and. segid CARD ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 end
return
`
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([
      'define fixed2 sele ( segid CARB .or. segid CARC ) end',
      'define fixed3 sele ( resid 1 .and. segid CARD ) end',
      'cons fix sele fixed1 .or. fixed2 .or. fixed3 end (fixed2, fixed3 not set by a define above)'
    ])
  })

  it('lists commands OpenMM does not apply', () => {
    const inp = `define fixed1 sele ( resid 1:10 .and. segid PROA ) end
cons fix sele fixed1 end
cons harm force 5.0 sele fixed1 end
CONS FIX SELE fixed1 END
`
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([
      'cons harm force 5.0 sele fixed1 end',
      'CONS FIX SELE fixed1 END'
    ])
  })

  it('lists a name used before its define', () => {
    const inp = `shape desc dock1 rigid sele rigid1 end
define rigid1 sele ( resid 1:10 .and. segid PROA ) end
`
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([
      'shape desc dock1 rigid sele rigid1 end (rigid1 not set by a define above)'
    ])
  })

  it('forgets a name redefined in a form it does not read', () => {
    const inp = `define rigid1 sele ( resid 1:10 .and. segid PROA ) end
define rigid1 sele ( segid PROB ) end
shape desc dock1 rigid sele rigid1 end
`
    expect(findOpenMMIgnoredConstInpLines(inp)).toEqual([
      'define rigid1 sele ( segid PROB ) end',
      'shape desc dock1 rigid sele rigid1 end (rigid1 not set by a define above)'
    ])
  })
})

describe('findSingleResidueFixedSegments', () => {
  it('lists fixed segments of one residue, not rigid ones', () => {
    const inp = `define fixed1 sele ( resid 5:5 .and. segid PROA ) end
define fixed2 sele ( resid 10:20 .and. segid PROA ) end
cons fix sele fixed1 .or. fixed2 end
define rigid1 sele ( resid 30:30 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
`
    expect(findSingleResidueFixedSegments(inp)).toEqual(['resid 5 on chain A'])
  })
})

describe('openmmConstInpMessage', () => {
  it('names the ignored lines and how to fix them', () => {
    const message = openmmConstInpMessage(
      `define fixed1 sele ( segid HETA ) end
cons fix sele fixed1 end`
    )
    expect(message).toContain('OpenMM would ignore these lines')
    expect(message).toContain('"define fixed1 sele ( segid HETA ) end"')
    expect(message).toContain('Inp Jiffy')
  })

  it('shows three lines and counts the rest', () => {
    const inp = Array.from(
      { length: 5 },
      (_, i) => `cons harm force 1.0 sele x${i} end`
    ).join('\n')
    expect(openmmConstInpMessage(inp)).toContain('; and 2 more.')
  })

  it('explains single fixed residues', () => {
    const message = openmmConstInpMessage(
      `define fixed1 sele ( resid 5:5 .and. segid PROA ) end
cons fix sele fixed1 end`
    )
    expect(message).toContain('OpenMM cannot fix a single residue yet')
    expect(message).toContain('"resid 5 on chain A"')
  })
})
