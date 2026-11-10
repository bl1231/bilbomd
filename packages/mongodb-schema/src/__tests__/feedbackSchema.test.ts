import { describe, it, expect } from 'vitest'
import { Job } from '../models/Job.js'

// The report as pipeline_decision_tree.py writes it (version 2)
const reportV2 = {
  version: 2,
  findings: [
    {
      code: 'fit_excellent',
      severity: 'good',
      title: 'Excellent fit (χ² 0.98)',
      detail: 'The model fits the data to within the experimental errors.'
    },
    {
      code: 'misfit_low_q',
      severity: 'warning',
      title: 'Misfit at low q (0.01 < q < 0.10 Å⁻¹, χ² 2.40)',
      detail: 'Low q reflects the overall size and mass of the particle.',
      region: 'low'
    }
  ],
  models: [
    {
      states: 1,
      file: 'multi_state_model_1_1_1.dat',
      chi_square: 1.46,
      selected: false
    },
    {
      states: 2,
      file: 'multi_state_model_2_1_1.dat',
      chi_square: 0.98,
      selected: true
    }
  ],
  regions: [
    {
      name: 'low',
      q_min: 0.0091,
      q_max: 0.0999,
      n_points: 177,
      chi_square: 2.4,
      mean_residual: -0.036
    },
    {
      name: 'mid',
      q_min: 0.1004,
      q_max: 0.1997,
      n_points: 194,
      chi_square: 1.08,
      mean_residual: -0.009
    }
  ],
  mw: {
    model_kda: 59.83,
    saxs_kda: 48.43,
    diff_fraction: -0.1906,
    method: 'vc_rambo_tainer',
    particle: 'protein',
    confidence: 'normal',
    nucleic_fraction: 0,
    model_pdb_file: 'ensemble_size_1_model.pdb',
    qmax_used: 0.3,
    guinier: { rg: 32.78, i0: 17.81, r2: 0.9896, qmin: 0.0122, qmax: 0.0394 },
    reason: null
  },
  mw_saxs: 48.43,
  mw_model: 59.83,
  mw_err: 0.1906,
  best_model_dat_file: 'multi_state_model_2_1_1.dat',
  best_ensemble_pdb_file: 'ensemble_size_1_model.pdb',
  overall_chi_square: 0.98,
  q_ranges: [0.0091, 0.0999, 0.1997],
  chi_squares_of_regions: [2.4, 1.08],
  residuals_of_regions: [-0.036, -0.009],
  mw_feedback: 'Molecular weight: model 59.8 kDa, SAXS estimate 48.4 kDa.',
  overall_chi_square_feedback: 'Excellent fit (χ² 0.98).',
  highest_chi_square_feedback: 'χ² is highest (2.40) for 0.01 < q < 0.10 Å⁻¹.',
  second_highest_chi_square_feedback:
    'χ² is second highest (1.08) for 0.10 < q < 0.20 Å⁻¹, which is acceptable.',
  regional_chi_square_feedback: 'Misfit at low q.'
}

// The same report when the MW comparison could not be made and the data
// cover a single q-region
const reportWithoutMw = {
  ...reportV2,
  mw: {
    ...reportV2.mw,
    model_kda: null,
    saxs_kda: null,
    diff_fraction: null,
    particle: null,
    confidence: null,
    nucleic_fraction: null,
    model_pdb_file: null,
    qmax_used: null,
    guinier: null,
    reason: 'No model PDB file was found in the results.'
  },
  mw_saxs: null,
  mw_model: null,
  mw_err: null,
  best_ensemble_pdb_file: null,
  q_ranges: [0.0091, 0.0999],
  chi_squares_of_regions: [2.4],
  residuals_of_regions: [-0.036],
  regions: [reportV2.regions[0]],
  second_highest_chi_square_feedback: null
}

// A report stored before version 2
const reportV1 = {
  mw_saxs: 46.5947,
  mw_model: 29.91,
  mw_err: 0.5578,
  best_model_dat_file: 'multi_state_model_1_1_1.dat',
  best_ensemble_pdb_file: 'ensemble_size_1_model.pdb',
  overall_chi_square: 1.23,
  q_ranges: [0.011428, 0.1, 0.2, 0.40267],
  chi_squares_of_regions: [1.78, 1.4, 0.9],
  residuals_of_regions: [-0.0, -0.069, 0.099],
  mw_feedback: 'The difference between the model MW and the SAXS MW is large.',
  overall_chi_square_feedback: 'The overall chi-square of this fit is 1.23.',
  highest_chi_square_feedback: 'The chi-square is highest (1.78).',
  second_highest_chi_square_feedback: 'The 2nd highest chi-square (1.4).',
  regional_chi_square_feedback: 'Please revisit sequence.'
}

const feedbackErrors = async (feedback: unknown): Promise<string[]> => {
  const error = await new Job({ feedback }).validate().then(
    () => undefined,
    (err: { errors?: Record<string, unknown> }) => err
  )
  return Object.keys(error?.errors ?? {}).filter((path) =>
    path.startsWith('feedback')
  )
}

const stored = (feedback: unknown) =>
  JSON.parse(JSON.stringify(new Job({ feedback }).toObject().feedback))

describe('Job.feedback schema', () => {
  it('accepts a version 2 report and keeps its structured fields', async () => {
    expect(await feedbackErrors(reportV2)).toEqual([])

    const saved = stored(reportV2)
    expect(saved.version).toBe(2)
    expect(saved.findings).toEqual(reportV2.findings)
    expect(saved.models).toEqual(reportV2.models)
    expect(saved.regions).toEqual(reportV2.regions)
    expect(saved.mw).toEqual(reportV2.mw)
    expect(saved.timestamp).toBeDefined()
  })

  it('accepts a report without a molecular-weight comparison', async () => {
    // Used to fail validation, so nothing at all was saved for the job
    expect(await feedbackErrors(reportWithoutMw)).toEqual([])

    const saved = stored(reportWithoutMw)
    expect(saved.mw_saxs).toBeNull()
    expect(saved.mw_model).toBeNull()
    expect(saved.mw_err).toBeNull()
    expect(saved.second_highest_chi_square_feedback).toBeNull()
    expect(saved.mw.guinier).toBeNull()
    expect(saved.mw.reason).toBe(reportWithoutMw.mw.reason)
  })

  it('still accepts a report stored before version 2', async () => {
    expect(await feedbackErrors(reportV1)).toEqual([])

    const saved = stored(reportV1)
    expect(saved.version).toBeUndefined()
    expect(saved.findings).toBeUndefined()
    expect(saved.regions).toBeUndefined()
    expect(saved.models).toBeUndefined()
    expect(saved.mw).toBeUndefined()
  })

  it('rejects an unknown severity or region', async () => {
    const bad = {
      ...reportV2,
      findings: [{ ...reportV2.findings[0], severity: 'catastrophic' }],
      regions: [{ ...reportV2.regions[0], name: 'ultra' }]
    }
    expect(await feedbackErrors(bad)).toEqual(
      expect.arrayContaining([
        'feedback.findings.0.severity',
        'feedback.regions.0.name'
      ])
    )
  })

  it('still requires the fit itself', async () => {
    const { overall_chi_square: _omitted, ...rest } = reportV2
    expect(await feedbackErrors(rest)).toContain('feedback.overall_chi_square')
  })
})
