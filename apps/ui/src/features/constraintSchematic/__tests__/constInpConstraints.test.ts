import { describe, it, expect } from 'vitest'
import { constraintsFromConstInp } from '../constInpConstraints'

describe('constraintsFromConstInp', () => {
  it('returns the bodies in the file', () => {
    const constraints =
      constraintsFromConstInp(`define fixed1 sele ( resid 1:100 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 120:200 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
return`)
    expect(constraints?.fixed_bodies).toHaveLength(1)
    expect(constraints?.rigid_bodies).toHaveLength(1)
  })

  it('returns null for empty text or a file with no bodies', () => {
    expect(constraintsFromConstInp('')).toBeNull()
    expect(constraintsFromConstInp('  \n')).toBeNull()
    expect(constraintsFromConstInp('return')).toBeNull()
    expect(
      constraintsFromConstInp(
        'define fixed1 sele ( resid 1:100 .and. segid PROA ) end\nreturn'
      )
    ).toBeNull()
  })
})
