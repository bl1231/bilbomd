import { describe, it, expect } from 'vitest'
import {
  FIXED_PALETTE,
  RIGID_PALETTE,
  fixedColor,
  flexibleColor,
  hexToNumber,
  rigidColor,
  rigidColorIndices
} from '../constraintColors'

describe('constraint palette', () => {
  it('picks the light or dark color', () => {
    expect(fixedColor(false)).toBe(FIXED_PALETTE[0])
    expect(fixedColor(true)).toBe(FIXED_PALETTE[1])
    expect(rigidColor(1, false)).toBe(RIGID_PALETTE[1]![0])
    expect(rigidColor(1, true)).toBe(RIGID_PALETTE[1]![1])
    expect(flexibleColor(false)).not.toBe(flexibleColor(true))
  })

  it('gives nine distinct rigid colors, none the fixed blue, then repeats', () => {
    const colors = RIGID_PALETTE.map((_, i) => rigidColor(i, false))
    expect(new Set(colors).size).toBe(9)
    expect(colors).not.toContain(fixedColor(false))
    expect(rigidColor(9, false)).toBe(rigidColor(0, false))
  })

  it('numbers rigid bodies in order, skipping ones with no segments', () => {
    const seg = { chain_id: 'A', residues: { start: 1, stop: 5 } }
    expect(
      rigidColorIndices({
        rigid_bodies: [
          { name: 'R1', segments: [seg] },
          { name: 'Empty', segments: [] },
          { name: 'R2', segments: [seg] }
        ]
      })
    ).toEqual([0, null, 1])
    expect(rigidColorIndices({})).toEqual([])
  })

  it('converts a hex color for the 3D viewer', () => {
    expect(hexToNumber('#2f54eb')).toBe(0x2f54eb)
  })
})
