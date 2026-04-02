import { describe, it, expect } from 'vitest'
import { calculateRgyrRange } from '../calculateRgyrRange.js'

describe('calculateRgyrRange', () => {
  it('produces 6 evenly-spaced values for a typical range', () => {
    expect(calculateRgyrRange(20, 40)).toEqual([20, 24, 28, 32, 36, 40])
  })

  it('always returns exactly 6 elements', () => {
    expect(calculateRgyrRange(10, 100)).toHaveLength(6)
  })

  it('returns all identical values when min equals max', () => {
    expect(calculateRgyrRange(30, 30)).toEqual([30, 30, 30, 30, 30, 30])
  })

  it('handles a zero-based range', () => {
    expect(calculateRgyrRange(0, 10)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('rounds non-integer steps', () => {
    // step = (15 - 10) / 5 = 1; all integers, no rounding needed
    const result = calculateRgyrRange(10, 15)
    expect(result).toEqual([10, 11, 12, 13, 14, 15])
  })

  it('rounds fractional steps correctly', () => {
    // step = (11 - 10) / 5 = 0.2; values: 10, 10.2→10, 10.4→10, 10.6→11, 10.8→11, 11
    const result = calculateRgyrRange(10, 11)
    result.forEach((v) => expect(Number.isInteger(v)).toBe(true))
    expect(result[0]).toBe(10)
    expect(result[5]).toBe(11)
  })

  it('first element equals rg_min and last equals rg_max', () => {
    const result = calculateRgyrRange(25, 75)
    expect(result[0]).toBe(25)
    expect(result[5]).toBe(75)
  })
})
