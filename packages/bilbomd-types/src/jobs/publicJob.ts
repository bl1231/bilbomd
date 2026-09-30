import { JobResultsDTO } from './results.js'
import { JobType, JobStatusEnum } from './jobs.js'
import { JobStepsDTO } from './jobSteps.js'
import { MDConstraintsDTO } from './mdConstraints.js'
import { OpenMMParametersDTO } from './openmm.js'
import { CHARMMParametersDTO } from './charmm.js'

// Non-sensitive job inputs shown in the "Inputs & parameters" section of the
// job page. Explicitly whitelisted: no user or account details.
export type PublicJobInputsDTO = {
  data_file?: string
  pdb_file?: string
  psf_file?: string
  crd_file?: string
  pae_file?: string
  fasta_file?: string
  query_json_file?: string
  const_inp_file?: string
  openmm_parameters?: OpenMMParametersDTO
  charmm_parameters?: CHARMMParametersDTO
  rg?: number
  rg_min?: number
  rg_max?: number
  conformational_sampling?: number
  d2o_fraction?: number
  bilbomd_uuids?: string[]
}

export type PublicJobStatus = {
  publicId: string
  jobId: string
  uuid: string
  jobType: JobType
  status: JobStatusEnum
  progress: number
  md_engine?: string
  md_constraints?: MDConstraintsDTO
  submittedAt: Date
  startedAt?: Date
  completedAt?: Date
  steps?: JobStepsDTO
  results?: JobResultsDTO
  title?: string
  inputs?: PublicJobInputsDTO
}

export type AnonJobResponse = {
  message: string
  jobid: string
  uuid: string
  md_engine?: string
  publicId?: string
  resultUrl?: string
}

export type FoxsDataPoint = {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

// Guinier fit of the experimental SAXS profile, computed server-side by
// autorg.py. Used to normalize dimensionless Kratky plots: (qRg)²·I(q)/I(0).
export type GuinierFit = {
  rg: number // unrounded Rg from the Guinier fit (Å)
  i0: number // forward scattering intensity I(0)
  qmin: number // low-q bound of the fit window (Å⁻¹)
  qmax: number // high-q bound of the fit window (Å⁻¹)
  r2?: number // coefficient of determination of the fit
}

// How χ²free / Vr were computed for a job (beta: Dmax is estimated)
export type FitMetricsInfo = {
  dmax: number // Å, used for the Shannon channel width π/Dmax
  dmaxSource: 'guinier_rg' // Dmax ≈ dmaxPerRg × Guinier Rg
  dmaxPerRg: number
  shannonChannels: number // channels spanned by the experimental q-range
  chi2freeRounds: number // random subsets used for the χ²free median
  vrQmax: number // Å⁻¹; Vr only uses q up to this
}

export type FoxsData = {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
  // Present only on the first (experimental/base) dataset when AutoRg succeeds
  guinier?: GuinierFit
  // Fit-quality metrics; present when a Dmax could be estimated
  chi2free?: number
  vr?: number
  // Present only on the first dataset alongside the metrics
  fitMetrics?: FitMetricsInfo
}
