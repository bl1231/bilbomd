import type { FoxsData, JobFeedbackDTO } from '@bilbomd/bilbomd-types'

// A version 2 report for a well-fitting 2-state ensemble
export const reportV2: JobFeedbackDTO = {
  version: 2,
  findings: [
    {
      code: 'fit_excellent',
      severity: 'good',
      title: 'Excellent fit (χ² 0.98)',
      detail: 'The model fits the data to within the experimental errors.'
    },
    {
      code: 'regions_ok',
      severity: 'good',
      title: 'No q-region stands out',
      detail: 'χ² is 2 or lower in every q-region assessed.'
    },
    {
      code: 'mw_consistent',
      severity: 'good',
      title: 'Molecular weight: model 59.8 kDa, SAXS estimate 48.4 kDa',
      detail: 'The SAXS estimate is 19% lower than the model.'
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
    },
    {
      states: 3,
      file: 'multi_state_model_3_1_1.dat',
      chi_square: 0.97,
      selected: false
    }
  ],
  regions: [
    {
      name: 'low',
      q_min: 0.0091,
      q_max: 0.0999,
      n_points: 177,
      chi_square: 1.14,
      mean_residual: -0.036
    },
    {
      name: 'mid',
      q_min: 0.1004,
      q_max: 0.1997,
      n_points: 194,
      chi_square: 1.08,
      mean_residual: -0.009
    },
    {
      name: 'high',
      q_min: 0.2002,
      q_max: 0.35,
      n_points: 294,
      chi_square: 0.85,
      mean_residual: 0.006
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
  q_ranges: [0.0091, 0.0999, 0.1997, 0.35],
  chi_squares_of_regions: [1.14, 1.08, 0.85],
  residuals_of_regions: [-0.036, -0.009, 0.006],
  mw_feedback: 'Molecular weight: model 59.8 kDa, SAXS estimate 48.4 kDa.',
  overall_chi_square_feedback: 'Excellent fit (χ² 0.98).',
  highest_chi_square_feedback: 'χ² is highest (1.14) for 0.01 < q < 0.10 Å⁻¹.',
  second_highest_chi_square_feedback: 'χ² is second highest (1.08).',
  regional_chi_square_feedback: 'No q-region stands out.',
  timestamp: new Date('2026-11-10T12:00:00Z')
}

// A poor fit whose model is about half the mass the data suggest
export const reportMismatch: JobFeedbackDTO = {
  ...reportV2,
  findings: [
    {
      code: 'fit_poor',
      severity: 'problem',
      title: 'Poor fit (χ² 12.40)',
      detail:
        'The model does not fit the data to within the experimental errors.'
    },
    {
      code: 'misfit_low_q',
      severity: 'problem',
      title: 'Misfit at low q (0.01 < q < 0.10 Å⁻¹, χ² 31.00)',
      detail: 'Low q reflects the overall size and mass of the particle.',
      region: 'low'
    },
    {
      code: 'mw_differs',
      severity: 'warning',
      title: 'Molecular weight: model 43.6 kDa, SAXS estimate 81.5 kDa',
      detail: 'The SAXS estimate is 87% higher than the model.'
    }
  ],
  mw: {
    ...reportV2.mw!,
    model_kda: 43.6,
    saxs_kda: 81.5,
    diff_fraction: 0.869
  },
  mw_saxs: 81.5,
  mw_model: 43.6,
  mw_err: 0.869,
  overall_chi_square: 12.4
}

// A report stored before version 2, whose MW gate fired
export const reportLegacy: JobFeedbackDTO = {
  mw_saxs: 46.5947,
  mw_model: 29.91,
  mw_err: 0.5578,
  best_model_dat_file: 'multi_state_model_1_1_1.dat',
  best_ensemble_pdb_file: 'ensemble_size_1_model.pdb',
  overall_chi_square: 1.23,
  q_ranges: [0.011428, 0.1, 0.2, 0.40267],
  chi_squares_of_regions: [1.78, 1.4, 0.9],
  residuals_of_regions: [-0.0, -0.069, 0.099],
  mw_feedback:
    'The difference between the model MW (29.91) and the SAXS MW (46.59469793184986) is large (55.8%), sequence or oligomerization state is likely incorrect.',
  overall_chi_square_feedback:
    'The overall chi-square of this fit is 1.23. Please examine your sequence or oligomerization state.',
  highest_chi_square_feedback:
    'The chi-square is highest (1.78) in the region where 0.01 < q < 0.1, but this is okay.',
  second_highest_chi_square_feedback:
    'The 2nd highest chi-square (1.4) is in the region where 0.1 < q < 0.2, but this is okay.',
  regional_chi_square_feedback:
    'Please revisit sequence and oligomerization state before examining flexibility.',
  timestamp: new Date('2026-10-20T12:00:00Z')
}

const fitPoints = (residuals: number[]) =>
  residuals.map((residual, index) => ({
    q: 0.01 + index * 0.05,
    exp_intensity: 100 + residual * 2,
    model_intensity: 100,
    error: 2
  }))

// What the FoXS data endpoint returns: the original model first, then one
// entry per ensemble size
export const foxsData: FoxsData[] = [
  {
    filename: 'minimization_output_saxs.dat',
    chisq: 3.2,
    c1: '1.02',
    c2: '0.5',
    data: fitPoints([2, -2, 3]),
    guinier: { rg: 32.8, i0: 17.8, qmin: 0.012, qmax: 0.039 }
  },
  {
    filename: 'multi_state_model_1_1_1.dat',
    chisq: 1.46,
    c1: '1.02',
    c2: '0.5',
    data: fitPoints([1, -1, 2]),
    chi2free: 1.6,
    vr: 0.21
  },
  {
    filename: 'multi_state_model_2_1_1.dat',
    chisq: 0.98,
    c1: '1.02',
    c2: '0.5',
    data: fitPoints([0.5, -1.5, 0.25, 20]),
    chi2free: 1.1,
    vr: 0.123
  }
]
