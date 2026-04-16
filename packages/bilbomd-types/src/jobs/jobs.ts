import { OpenMMParametersDTO } from './openmm.js'
import { CHARMMParametersDTO } from './charmm.js'
import { AlphafoldEntityDTO } from './alphafold.js'
import { UserSummaryDTO } from '../users/user.js'
import { MDConstraintsDTO } from './mdConstraints.js'
import { JobStepsDTO } from './jobSteps.js'
import { JobFeedbackDTO } from './feedback.js'
import { JobAssetsDTO } from './mdMovie.js'
import { NerscInfoDTO } from './nersc.js'
import { JobResultsDTO } from './results.js'

export type JobType =
  | 'pdb'
  | 'crd'
  | 'auto'
  | 'alphafold'
  | 'sans'
  | 'scoper'
  | 'multi'

export type MDEngine = 'CHARMM' | 'OpenMM'

export const JOB_STATUSES = [
  'Submitted',
  'Pending',
  'Running',
  'Completed',
  'Error',
  'Failed',
  'Cancelled'
] as const

export type JobStatusEnum = (typeof JOB_STATUSES)[number]

export interface BaseJobDTO {
  id: string
  jobType: JobType
  title: string
  uuid: string
  access_mode: 'user' | 'anonymous'
  public_id?: string
  status: JobStatusEnum
  data_file: string
  md_engine?: MDEngine
  openmm_parameters?: OpenMMParametersDTO
  charmm_parameters?: CHARMMParametersDTO
  md_constraints?: MDConstraintsDTO
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
  user?: UserSummaryDTO
  resubmitted_from?: string
  steps?: JobStepsDTO
  progress: number
  feedback?: JobFeedbackDTO
  assets?: JobAssetsDTO
  nersc?: NerscInfoDTO
  cleanup_in_progress: boolean
  results_ready?: boolean
  results?: JobResultsDTO
}

export interface BilboMDPDBDTO extends BaseJobDTO {
  pdb_file: string
  const_inp_file: string
  psf_file?: string
  crd_file?: string
  conformational_sampling: number
  rg: number
  rg_min: number
  rg_max: number
}

export interface BilboMDCRDDTO extends BaseJobDTO {
  psf_file: string
  crd_file: string
  const_inp_file: string
  pdb_file?: string
  conformational_sampling: number
  rg: number
  rg_min: number
  rg_max: number
}

export interface BilboMDAutoDTO extends BaseJobDTO {
  pdb_file: string
  pae_file: string
  psf_file?: string
  crd_file?: string
  const_inp_file?: string
  conformational_sampling: number
  rg?: number
  rg_min?: number
  rg_max?: number
}

export interface BilboMDAlphaFoldDTO extends BaseJobDTO {
  alphafold_entities: AlphafoldEntityDTO[]
  fasta_file: string
  pdb_file?: string
  psf_file?: string
  crd_file?: string
  pae_file?: string
  const_inp_file?: string
  conformational_sampling: number
  rg?: number
  rg_min?: number
  rg_max?: number
}

export interface BilboMDSANSDTO extends BaseJobDTO {
  pdb_file: string
  psf_file?: string
  crd_file?: string
  const_inp_file: string
  conformational_sampling: number
  d2o_fraction: number
  rg: number
  rg_min: number
  rg_max: number
  deuteration_fractions: { label: string; fraction: number }[]
}

export interface BilboMDScoperDTO extends BaseJobDTO {
  pdb_file: string
  fixc1c2: boolean
  foxs_top_file?: string
}

export interface BilboMDMultiDTO extends BaseJobDTO {
  bilbomd_uuids: string[]
  data_file_from: string
  bilbomd_jobs?: []
}

export type BilboMDMongoJobDTO =
  | BilboMDPDBDTO
  | BilboMDCRDDTO
  | BilboMDAutoDTO
  | BilboMDAlphaFoldDTO
  | BilboMDSANSDTO
  | BilboMDScoperDTO
  | BilboMDMultiDTO

export interface BilboMDJobDTO {
  id: string
  username: string
  mongo: BilboMDMongoJobDTO
}
