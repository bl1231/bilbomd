export type FeedbackSeverity = 'good' | 'info' | 'warning' | 'problem'
export type FeedbackRegionName = 'low' | 'mid' | 'high'

// One conclusion of the fit assessment. The wording is written by the
// assessment script; clients style it by severity.
export interface FeedbackFinding {
  code: string
  severity: FeedbackSeverity
  title: string
  detail: string
  region?: FeedbackRegionName
}

export interface FeedbackRegion {
  name: FeedbackRegionName
  q_min: number
  q_max: number
  n_points: number
  chi_square: number
  mean_residual: number
}

// Chi-square of each MultiFoXS ensemble size, and which one was assessed
export interface FeedbackModel {
  states: number
  file: string
  chi_square: number
  selected: boolean
}

export interface FeedbackGuinier {
  rg: number
  i0: number | null
  r2: number | null
  qmin: number | null
  qmax: number | null
}

// Advisory comparison of the model's mass with a SAXS estimate
export interface FeedbackMw {
  model_kda: number | null
  saxs_kda: number | null
  // (saxs - model) / model
  diff_fraction: number | null
  method: string
  particle: 'protein' | 'rna' | null
  // 'low' when the method's assumptions do not hold for this sample
  confidence: 'normal' | 'low' | null
  nucleic_fraction: number | null
  model_pdb_file: string | null
  qmax_used: number | null
  guinier: FeedbackGuinier | null
  // Why the estimate is missing or low-confidence
  reason: string | null
}

export interface JobFeedbackDTO {
  // Model and SAXS-estimated molecular weights (kDa) and their relative
  // difference. null when the comparison could not be made.
  mw_saxs: number | null
  mw_model: number | null
  mw_err: number | null
  best_model?: string // Make the old property optional
  best_model_dat_file: string
  // The model PDB the mass was taken from
  best_ensemble_pdb_file: string | null
  overall_chi_square: number
  // Edges of the q-regions assessed; one more entry than the two arrays below
  q_ranges: number[]
  chi_squares_of_regions: number[]
  residuals_of_regions: number[]
  mw_feedback: string
  overall_chi_square_feedback: string
  highest_chi_square_feedback: string | null
  second_highest_chi_square_feedback: string | null
  regional_chi_square_feedback: string | null
  timestamp: Date
  // Version 2 of the report adds the structured fields below. Reports stored
  // before that have none of them.
  version?: number
  findings?: FeedbackFinding[]
  regions?: FeedbackRegion[]
  models?: FeedbackModel[]
  mw?: FeedbackMw
}
