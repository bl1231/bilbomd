import { JobResultsDTO } from './results.js'
import { JobType, JobStatusEnum } from './jobs.js'
import { JobStepsDTO } from './jobSteps.js'
import { MDConstraintsDTO } from './mdConstraints.js'

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

export type FoxsData = {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
  // Present only on the first (experimental/base) dataset when AutoRg succeeds
  guinier?: GuinierFit
}
