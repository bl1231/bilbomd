import { describe, it, expect } from 'vitest'
import {
  describeDiff,
  feedbackAttention,
  findFit,
  mwMismatch,
  qAxisTicks,
  residualAxisLimit,
  residualPoints,
  stateLabel,
  statesInFile,
  toFeedbackView
} from '../feedbackModel'
import { foxsData, reportLegacy, reportMismatch, reportV2 } from './fixtures'

describe('toFeedbackView (version 2)', () => {
  const view = toFeedbackView(reportV2)

  it('takes the fit finding as the verdict and lists the rest', () => {
    expect(view.legacy).toBe(false)
    expect(view.verdict.code).toBe('fit_excellent')
    expect(view.findings.map((f) => f.code)).toEqual([
      'regions_ok',
      'mw_consistent'
    ])
  })

  it('names the assessed model', () => {
    expect(view.assessed).toEqual({
      states: 2,
      file: 'multi_state_model_2_1_1.dat',
      chiSquare: 0.98
    })
    expect(view.models).toHaveLength(3)
    expect(view.regions.map((r) => r.name)).toEqual(['low', 'mid', 'high'])
  })

  it('summarises the molecular-weight comparison', () => {
    expect(view.mw).toMatchObject({
      status: 'consistent',
      modelKda: 59.83,
      saxsKda: 48.43,
      diffFraction: -0.1906,
      guinierRg: 32.78
    })
    expect(toFeedbackView(reportMismatch).mw.status).toBe('differs')
  })

  it('reports an unassessed or low-confidence molecular weight', () => {
    const lowConfidence = toFeedbackView({
      ...reportV2,
      findings: [
        reportV2.findings![0]!,
        { ...reportV2.findings![2]!, code: 'mw_low_confidence' }
      ],
      mw: { ...reportV2.mw!, confidence: 'low', reason: 'A mixture.' }
    })
    expect(lowConfidence.mw.status).toBe('low_confidence')
    expect(lowConfidence.mw.note).toBe('A mixture.')

    const notAssessed = toFeedbackView({
      ...reportV2,
      findings: [reportV2.findings![0]!],
      mw: undefined,
      mw_saxs: null,
      mw_model: null,
      mw_err: null
    })
    expect(notAssessed.mw).toMatchObject({
      status: 'not_assessed',
      modelKda: null,
      saxsKda: null
    })
  })
})

describe('toFeedbackView (before version 2)', () => {
  it('drops the unreliable molecular weight and the messages it replaced', () => {
    const view = toFeedbackView(reportLegacy)

    expect(view.legacy).toBe(true)
    expect(view.mw.status).toBe('legacy')
    expect(view.mw.modelKda).toBeNull()
    // The MW gate fired (56 % > 30 %), so the overall and regional messages
    // were the gate's, not the fit's
    expect(view.verdict.title).toBe('χ² 1.23')
    expect(view.verdict.detail).toBe('')
    expect(view.findings.map((f) => f.code)).toEqual([
      'legacy_highest',
      'legacy_second'
    ])
    expect(JSON.stringify(view)).not.toContain('oligomerization')
  })

  it('keeps the fit messages when the gate did not fire', () => {
    const view = toFeedbackView({
      ...reportLegacy,
      mw_err: 0.1,
      overall_chi_square_feedback: 'Moderate.',
      regional_chi_square_feedback: 'A good fit overall.'
    })
    expect(view.verdict.detail).toBe('Moderate.')
    expect(view.findings.map((f) => f.code)).toContain('legacy_regional')
  })

  it('rebuilds the regions and the assessed model from the old fields', () => {
    const view = toFeedbackView(reportLegacy)
    expect(view.regions.map((r) => [r.name, r.q_min, r.q_max])).toEqual([
      ['low', 0.011428, 0.1],
      ['mid', 0.1, 0.2],
      ['high', 0.2, 0.40267]
    ])
    expect(view.assessed.states).toBe(1)
    expect(view.models).toEqual([])
  })

  it('survives arrays of mismatched length', () => {
    const view = toFeedbackView({
      ...reportLegacy,
      q_ranges: [0.01, 0.1, 0.2],
      chi_squares_of_regions: [0.8, 1.5, 2.5]
    })
    expect(view.regions).toHaveLength(2)
  })
})

describe('feedbackAttention', () => {
  it('is the worst severity when that is a warning or a problem', () => {
    expect(feedbackAttention(reportV2)).toBeUndefined()
    expect(feedbackAttention(reportMismatch)).toBe('problem')
    expect(
      feedbackAttention({
        ...reportV2,
        findings: [
          reportV2.findings![0]!,
          { ...reportV2.findings![2]!, code: 'mw_differs', severity: 'warning' }
        ]
      })
    ).toBe('warning')
  })

  it('never marks a report from before version 2, or a missing one', () => {
    expect(feedbackAttention(reportLegacy)).toBeUndefined()
    expect(feedbackAttention(undefined)).toBeUndefined()
  })
})

describe('mwMismatch', () => {
  it('returns both masses when the report flags a mismatch', () => {
    expect(mwMismatch(reportMismatch)).toEqual({
      modelKda: 43.6,
      saxsKda: 81.5,
      diffFraction: 0.869
    })
  })

  it('is undefined for a consistent, missing or legacy report', () => {
    expect(mwMismatch(reportV2)).toBeUndefined()
    expect(mwMismatch(undefined)).toBeUndefined()
    // 56 % apart, but computed by the unreliable first version
    expect(mwMismatch(reportLegacy)).toBeUndefined()
  })

  it('is undefined when the masses are missing', () => {
    expect(mwMismatch({ ...reportMismatch, mw: undefined })).toBeUndefined()
  })
})

describe('labels', () => {
  it('names models by their number of states', () => {
    expect(stateLabel(1)).toBe('single-state model')
    expect(stateLabel(3)).toBe('3-state ensemble')
    expect(stateLabel(undefined)).toBe('model')
    expect(statesInFile('multi_state_model_12_1_1.dat')).toBe(12)
    expect(statesInFile('model_a.dat')).toBeUndefined()
  })

  it('describes a difference relative to the model', () => {
    expect(describeDiff(0.869)).toBe('87% higher')
    expect(describeDiff(-0.1906)).toBe('19% lower')
  })
})

describe('residuals', () => {
  it('finds the assessed fit and computes its residuals', () => {
    const fit = findFit(foxsData, 'multi_state_model_2_1_1.dat')
    expect(fit?.chi2free).toBe(1.1)
    expect(residualPoints(fit).map((p) => p.residual)).toEqual([
      0.5, -1.5, 0.25, 20
    ])
    expect(findFit(foxsData, 'missing.dat')).toBeUndefined()
    expect(residualPoints(undefined)).toEqual([])
  })

  it('skips points that cannot be scored', () => {
    const points = residualPoints({
      ...foxsData[1]!,
      data: [
        { q: 0.01, exp_intensity: 10, model_intensity: 9, error: 0 },
        { q: 0.02, exp_intensity: 10, model_intensity: 9, error: 0.5 }
      ]
    })
    expect(points).toEqual([{ q: 0.02, residual: 2 }])
  })

  it('puts q-axis ticks on round values inside the data', () => {
    expect(qAxisTicks(0.0091, 0.35)).toEqual([
      0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35
    ])
    expect(qAxisTicks(0.06, 0.17)).toEqual([0.1, 0.15])
    expect(qAxisTicks(0.01, 0.04)).toEqual([])
  })

  it('keeps the axis symmetric, at least ±3 and at most ±8', () => {
    expect(residualAxisLimit([{ q: 0.1, residual: 0.4 }])).toBe(3)
    expect(residualAxisLimit([{ q: 0.1, residual: -4.2 }])).toBe(5)
    expect(residualAxisLimit([{ q: 0.1, residual: 20 }])).toBe(8)
    expect(residualAxisLimit([])).toBe(3)
  })
})
