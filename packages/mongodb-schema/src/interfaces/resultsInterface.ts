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
}

interface IClassicResults {
  ensemble_size?: number
  ensemble_members?: IEnsembleMember[]
  rg_min?: number
  rg_max?: number
  rg_mean?: number
  rg_std?: number
  dmax_min?: number
  dmax_max?: number
  dmax_mean?: number
  foxs_best_model_dat?: string
  foxs_chi2_best_model?: number
  multifoxs_best_ensemble_dat?: string
  multifoxs_chi2_best_ensemble?: number
  ensemble_size_file?: string
  foxs_results_json?: string
  multifoxs_results_json?: string
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
