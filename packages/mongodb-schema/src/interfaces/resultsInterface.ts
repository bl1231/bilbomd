interface IJobResultsSummary {
  ensemble_size?: number
  warnings?: string[]
  notes?: string[]
  version?: string
}

interface IEnsembleMember {
  pdb: string
  weight?: number
  rg?: number
  weight_avg?: number // Average weight across good scoring models
  weight_stddev?: number // Standard deviation of the weight
  fraction?: number // Fraction of good scoring models containing this conformation
}

interface IEnsemble {
  size: number // The size of the ensemble (e.g., 3 for ensemble_size_3.txt)
  models: IEnsembleModel[] // Array of multi-state models for this ensemble size
}

interface IEnsembleModel {
  rank: number // Rank of the multi-state model
  chi2: number // Chi^2 value for the fit to SAXS profile
  c1: number // c1 value from MultiFoXS optimized fit
  c2: number // c2 value from MultiFoXS optimized fit
  states: IEnsembleMember[] // Array of states in this multi-state model
}

interface IClassicResults {
  total_num_ensembles?: number
  ensembles?: IEnsemble[]
}

interface IAutoResults {
  total_num_ensembles?: number
  ensembles?: IEnsemble[]
}

interface IAlphaFoldResults {
  total_num_ensembles?: number
  ensembles?: IEnsemble[]
}

interface ISANSResults {}

interface IScoperResults {
  kgs_conformations?: number
  kgs_files?: number
  foxs_progress?: number
  foxs_top_file?: string
  foxs_top_score?: number
  created_features?: boolean
  prediction_threshold?: number
  multifoxs_ensemble_size?: number
  multifoxs_score?: number
}

interface IJobResults {
  summary?: IJobResultsSummary
  classic?: IClassicResults
  auto?: IAutoResults
  alphafold?: IAlphaFoldResults
  sans?: ISANSResults
  scoper?: IScoperResults
}

export {
  IJobResults,
  IJobResultsSummary,
  IClassicResults,
  IEnsemble,
  IEnsembleModel,
  IEnsembleMember,
  IScoperResults
}
