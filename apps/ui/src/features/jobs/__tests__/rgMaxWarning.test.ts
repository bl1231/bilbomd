import { describe, it, expect } from 'vitest'
import { getRgMaxWarning } from '../rgMaxWarning'

describe('getRgMaxWarning', () => {
  it('returns null when rg_max is within 2× the measured Rg', () => {
    expect(getRgMaxWarning(23, 46)).toBeNull()
    expect(getRgMaxWarning(33, 49)).toBeNull()
    expect(getRgMaxWarning('23', '40')).toBeNull()
  })

  it('returns warning details when rg_max exceeds 2× the measured Rg', () => {
    const warning = getRgMaxWarning(23, 100)
    expect(warning).not.toBeNull()
    expect(warning).toEqual({
      rg: 23,
      rgMax: 100,
      ratio: '4.3',
      recommended: 46
    })
  })

  it('accepts string form values', () => {
    const warning = getRgMaxWarning('20', '60')
    expect(warning).toEqual({
      rg: 20,
      rgMax: 60,
      ratio: '3.0',
      recommended: 40
    })
  })

  it('returns null for missing, empty, or non-numeric values', () => {
    expect(getRgMaxWarning('', '')).toBeNull()
    expect(getRgMaxWarning('abc', '100')).toBeNull()
    expect(getRgMaxWarning('23', '')).toBeNull()
    expect(getRgMaxWarning(NaN, NaN)).toBeNull()
  })

  it('returns null when rg is zero or negative', () => {
    expect(getRgMaxWarning(0, 100)).toBeNull()
    expect(getRgMaxWarning(-10, 100)).toBeNull()
  })

  it('does not warn at exactly the 2× boundary', () => {
    expect(getRgMaxWarning(25, 50)).toBeNull()
    // Just above the boundary should warn
    expect(getRgMaxWarning(25, 51)).not.toBeNull()
  })
})
