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
  total_num_ensembles?: number // Total number of ensembles (N)
  ensembles?: IEnsemble[] // Array of ensembles for each N
}

interface IBilboMDAutoResults {}

interface IAlphaFoldResults {}

interface ISANSResults {}

interface IScoperResults {
  foxs_top_file?: string
}

interface IJobResults {
  summary?: IJobResultsSummary
  classic?: IClassicResults
  auto?: IBilboMDAutoResults
  alphafold?: IAlphaFoldResults
  sans?: ISANSResults
  scoper?: IScoperResults
}

export { IJobResults }
