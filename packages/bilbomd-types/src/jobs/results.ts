export interface JobSummary {
  ensemble_size: number
}

export interface IEnsembleMember {
  pdb: string
  weight?: number
  rg?: number
  weight_avg?: number // Average weight across good scoring models
  weight_stddev?: number // Standard deviation of the weight
  fraction?: number // Fraction of good scoring models containing this conformation
}

export interface IEnsembleModel {
  rank: number // Rank of the multi-state model
  chi2: number // Chi^2 value for the fit to SAXS profile
  c1: number // c1 value from MultiFoXS optimized fit
  c2: number // c2 value from MultiFoXS optimized fit
  states: IEnsembleMember[] // Array of states in this multi-state model
}

export interface IEnsemble {
  size: number // The size of the ensemble (e.g., 3 for ensemble_size_3.txt)
  models: IEnsembleModel[] // Array of multi-state models for this ensemble size
}

export interface ClassicJobResults {
  total_num_ensembles?: number // Total number of ensembles (N)
  ensembles?: IEnsemble[] // Array of ensembles for each N
}

export type JobResultsDTO = {
  summary: JobSummary | null
  classic: ClassicJobResults | null
  auto: Record<string, unknown> | null
  alphafold: Record<string, unknown> | null
  sans: Record<string, unknown> | null
  scoper: Record<string, unknown> | null
}
