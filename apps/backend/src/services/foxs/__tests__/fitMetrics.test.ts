import { describe, it, expect } from 'vitest'
import type { FoxsDataPoint } from '@bilbomd/bilbomd-types'
import {
  DMAX_PER_RG,
  estimateDmax,
  shannonBins,
  computeChi2Free,
  computeVr,
  countShannonChannels,
  VR_QMAX
} from '../fitMetrics.js'

// Dmax = π Å makes each Shannon channel exactly 1 Å⁻¹ wide, so channel
// membership is easy to reason about in these tests.
const DMAX_UNIT_CHANNELS = Math.PI

// The unit-channel Vr tests span q far above VR_QMAX, so lift the cutoff
const NO_CAP = { qmax: Infinity }

const point = (
  q: number,
  exp_intensity: number,
  model_intensity: number,
  error = 1
): FoxsDataPoint => ({ q, exp_intensity, model_intensity, error })

// n points evenly spaced over [0, channels), i.e. n / channels per channel
const grid = (
  channels: number,
  perChannel: number,
  f: (q: number, i: number) => Omit<FoxsDataPoint, 'q'>
): FoxsDataPoint[] =>
  Array.from({ length: channels * perChannel }, (_, i) => {
    const q = i / perChannel
    return { q, ...f(q, i) }
  })

describe('estimateDmax', () => {
  it('scales the Guinier Rg by DMAX_PER_RG', () => {
    expect(estimateDmax(20)).toBe(20 * DMAX_PER_RG)
  })
})

describe('shannonBins', () => {
  it('groups points into consecutive channels of width π/Dmax from the lowest q', () => {
    const points = [0.1, 0.9, 1.0, 1.5, 3.2].map((q) => point(q, 1, 1))

    const bins = shannonBins(points, DMAX_UNIT_CHANNELS)

    // channels start at q0 = 0.1: [0.1, 1.1), [1.1, 2.1), [3.1, 4.1); the
    // empty [2.1, 3.1) channel is dropped
    expect(bins.map((b) => b.map((p) => p.q))).toEqual([
      [0.1, 0.9, 1.0],
      [1.5],
      [3.2]
    ])
  })

  it('sorts by q first', () => {
    const bins = shannonBins(
      [point(1.5, 1, 1), point(0.2, 1, 1)],
      DMAX_UNIT_CHANNELS
    )
    expect(bins.flat().map((p) => p.q)).toEqual([0.2, 1.5])
  })

  it('returns nothing for an invalid Dmax or no points', () => {
    expect(shannonBins([point(0.1, 1, 1)], 0)).toEqual([])
    expect(shannonBins([], DMAX_UNIT_CHANNELS)).toEqual([])
  })
})

describe('computeChi2Free', () => {
  it('is 0 for a perfect fit', () => {
    const points = grid(10, 5, () => ({
      exp_intensity: 2,
      model_intensity: 2,
      error: 0.1
    }))
    expect(computeChi2Free(points, DMAX_UNIT_CHANNELS)).toBe(0)
  })

  it('is k/(k−1) when every residual is exactly 1σ', () => {
    // Every subset of k points sums to k, reduced by k − 1 degrees of freedom
    const k = 12
    const points = grid(k, 4, () => ({
      exp_intensity: 3,
      model_intensity: 2,
      error: 1
    }))
    expect(computeChi2Free(points, DMAX_UNIT_CHANNELS)).toBeCloseTo(
      k / (k - 1),
      10
    )
  })

  it('is about 1 for pure noise with correctly estimated errors', () => {
    // Deterministic standard-normal noise (Box–Muller over a fixed LCG)
    let s = 12345
    const uniform = () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return (s + 1) / 2147483649
    }
    const gaussian = () =>
      Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform())
    const points = grid(40, 10, (q) => {
      const model = 100 * Math.exp(-q / 10)
      const sigma = 0.05 * model
      return {
        exp_intensity: model + sigma * gaussian(),
        model_intensity: model,
        error: sigma
      }
    })

    const chi2free = computeChi2Free(points, DMAX_UNIT_CHANNELS)!
    expect(chi2free).toBeGreaterThan(0.7)
    expect(chi2free).toBeLessThan(1.3)
  })

  it('counts only one point per channel, however densely a channel is sampled', () => {
    // Channel 0 is sampled 50× more densely and fits badly; χ² over all
    // points would be dominated by it, χ²free weighs it as one channel of k
    const badDense = Array.from({ length: 500 }, (_, i) =>
      point(i / 500, 12, 2, 1)
    )
    const goodSparse = Array.from({ length: 9 }, (_, i) =>
      point(1 + i, 2, 2, 1)
    )
    const points = [...badDense, ...goodSparse]
    const fullChi2 =
      points.reduce(
        (s, p) => s + ((p.exp_intensity - p.model_intensity) / p.error) ** 2,
        0
      ) / points.length

    const chi2free = computeChi2Free(points, DMAX_UNIT_CHANNELS)!

    expect(fullChi2).toBeGreaterThan(95)
    // one channel with residual 10σ among k = 10: 100 / (10 − 1)
    expect(chi2free).toBeCloseTo(100 / 9, 10)
  })

  it('is deterministic for a given seed', () => {
    const points = grid(15, 6, (q, i) => ({
      exp_intensity: 10 + (i % 3),
      model_intensity: 10,
      error: 1
    }))
    const a = computeChi2Free(points, DMAX_UNIT_CHANNELS)
    const b = computeChi2Free(points, DMAX_UNIT_CHANNELS)
    expect(a).toBe(b)
  })

  it('ignores points with a missing or non-positive error', () => {
    const points = grid(5, 2, () => ({
      exp_intensity: 2,
      model_intensity: 2,
      error: 1
    }))
    points.push(point(0.25, 1000, 2, 0), point(0.75, 1000, 2, NaN))
    expect(computeChi2Free(points, DMAX_UNIT_CHANNELS)).toBe(0)
  })

  it('needs at least 3 channels', () => {
    const points = grid(2, 5, () => ({
      exp_intensity: 3,
      model_intensity: 2,
      error: 1
    }))
    expect(computeChi2Free(points, DMAX_UNIT_CHANNELS)).toBeUndefined()
  })
})

describe('computeVr', () => {
  it('is 0 when the curves differ only by a constant scale', () => {
    const points = grid(8, 4, (q) => {
      const model = 50 * Math.exp(-q)
      return { exp_intensity: 3 * model, model_intensity: model, error: 1 }
    })
    expect(computeVr(points, DMAX_UNIT_CHANNELS, NO_CAP)).toBeCloseTo(0, 12)
  })

  it('sums |ΔR| / mean(R) over neighbouring channels', () => {
    // One point per channel with ratios 1, 2, 1
    const points = [point(0, 1, 1), point(1, 2, 1), point(2, 1, 1)]
    // |1−2|/1.5 + |2−1|/1.5
    expect(computeVr(points, DMAX_UNIT_CHANNELS, NO_CAP)).toBeCloseTo(4 / 3, 12)
  })

  it('does not depend on the overall intensity scale', () => {
    const base = [point(0, 1, 1), point(1, 3, 2), point(2, 2, 2)]
    const scaled = base.map((p) => ({
      ...p,
      exp_intensity: p.exp_intensity * 7
    }))
    expect(computeVr(scaled, DMAX_UNIT_CHANNELS, NO_CAP)).toBeCloseTo(
      computeVr(base, DMAX_UNIT_CHANNELS, NO_CAP)!,
      12
    )
  })

  it('averages intensities within each channel before taking the ratio', () => {
    const points = [
      point(0.1, 1, 1),
      point(0.6, 3, 1), // channel 0: mean exp 2, mean model 1 → R = 2
      point(1.2, 2, 2) //  channel 1: R = 1
    ]
    // |2 − 1| / 1.5
    expect(computeVr(points, DMAX_UNIT_CHANNELS, NO_CAP)).toBeCloseTo(2 / 3, 12)
  })

  it('skips points with non-positive intensities', () => {
    const points = [
      point(0, 1, 1),
      point(0.5, -5, 1),
      point(1, 1, 1),
      point(1.5, 1, 0)
    ]
    expect(computeVr(points, DMAX_UNIT_CHANNELS, NO_CAP)).toBe(0)
  })

  it('ignores q above VR_QMAX by default', () => {
    // Dmax = 100 Å → channels ≈ 0.031 Å⁻¹ wide. Below the cutoff the curves
    // differ only by scale (Vr = 0); above it the ratio swings wildly.
    const points = Array.from({ length: 50 }, (_, i) => {
      const q = 0.01 + i * 0.01
      const noisy = q > VR_QMAX ? (i % 2 ? 5 : 0.2) : 1
      return point(q, 2 * noisy, 1)
    })

    expect(computeVr(points, 100)).toBeCloseTo(0, 12)
    expect(computeVr(points, 100, NO_CAP)).toBeGreaterThan(1)
  })

  it('needs at least 2 channels', () => {
    expect(
      computeVr(
        [point(0.1, 1, 1), point(0.2, 2, 1)],
        DMAX_UNIT_CHANNELS,
        NO_CAP
      )
    ).toBeUndefined()
  })
})

describe('countShannonChannels', () => {
  it('counts the non-empty channels among usable points', () => {
    const points = [
      point(0.1, 1, 1),
      point(1.5, 1, 1),
      point(3.2, 1, 1),
      point(5.5, 1, 1, 0) // unusable (zero error), not counted
    ]
    expect(countShannonChannels(points, DMAX_UNIT_CHANNELS)).toBe(3)
  })
})
