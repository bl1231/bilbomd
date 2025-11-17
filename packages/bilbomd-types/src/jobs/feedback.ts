export interface JobFeedbackDTO {
  mw_saxs: number
  mw_model: number
  mw_err: number
  best_model?: string
  best_model_dat_file: string
  best_ensemble_pdb_file: string
  overall_chi_square: number
  q_ranges: number[]
  chi_squares_of_regions: number[]
  residuals_of_regions: number[]
  mw_feedback: string
  overall_chi_square_feedback: string
  highest_chi_square_feedback: string
  second_highest_chi_square_feedback: string
  regional_chi_square_feedback: string
  timestamp: Date
}
