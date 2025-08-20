import { Document, Types } from 'mongoose'
import { IUser } from './userInterface'

export const StepStatus = {
  Waiting: 'Waiting',
  Running: 'Running',
  Success: 'Success',
  Error: 'Error'
} as const

export const JobStatus = {
  Submitted: 'Submitted',
  Pending: 'Pending',
  Running: 'Running',
  Completed: 'Completed',
  Error: 'Error',
  Failed: 'Failed',
  Cancelled: 'Cancelled'
} as const

export const NerscStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  NODE_FAIL: 'NODE_FAIL',
  PREEMPTED: 'PREEMPTED',
  SUSPENDED: 'SUSPENDED'
} as const

export const MDEngine = {
  CHARMM: 'CHARMM',
  OpenMM: 'OpenMM'
} as const

interface IStepStatus {
  status: StepStatusEnum
  message: string
}

// Interface for steps status
interface IBilboMDSteps {
  alphafold?: IStepStatus
  pdb2crd?: IStepStatus
  pae?: IStepStatus
  autorg?: IStepStatus
  minimize?: IStepStatus
  initfoxs?: IStepStatus
  heat?: IStepStatus
  md?: IStepStatus
  dcd2pdb?: IStepStatus
  pdb_remediate?: IStepStatus
  foxs?: IStepStatus
  pepsisans?: IStepStatus
  multifoxs?: IStepStatus
  gasans?: IStepStatus
  copy_results_to_cfs?: IStepStatus
  results?: IStepStatus
  email?: IStepStatus
  nersc_prepare_slurm_batch?: IStepStatus
  nersc_submit_slurm_batch?: IStepStatus
  nersc_job_status?: IStepStatus
  nersc_copy_results_to_cfs?: IStepStatus
}

interface IAlphaFoldEntity {
  name: string
  sequence: string
  type: string
  copies: number
}

interface IFeedbackData {
  mw_saxs: number
  mw_model: number
  mw_err: number
  best_model?: string // Make the old property optional
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

interface INerscInfo {
  jobid: string
  state: NerscStatusEnum
  qos: string
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
}

interface IJob extends Document {
  _id: Types.ObjectId
  __t:
    | 'BilboMd'
    | 'BilboMdPDB'
    | 'BilboMdCRD'
    | 'BilboMdAuto'
    | 'BilboMdScoper'
    | 'BilboMdAlphaFold'
    | 'BilboMdSANS'
  title: string
  uuid: string
  status: JobStatusEnum
  data_file: string
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
  user: IUser | Types.ObjectId
  resubmitted_from?: IJob | Types.ObjectId
  steps: IBilboMDSteps
  progress: number
  feedback?: IFeedbackData
  nersc?: INerscInfo
  cleanup_in_progress: boolean
}

interface IBilboMDPDBJob extends IJob {
  __t: 'BilboMdPDB'
  psf_file?: string
  crd_file?: string
  pdb_file: string
  const_inp_file: string
  md_engine?: MDEngineEnum
  conformational_sampling: number
  rg: number
  rg_min: number
  rg_max: number
}

interface IBilboMDCRDJob extends IJob {
  __t: 'BilboMdCRD'
  psf_file: string
  crd_file: string
  pdb_file?: string
  const_inp_file: string
  md_engine?: MDEngineEnum
  conformational_sampling: number
  rg: number
  rg_min: number
  rg_max: number
}

interface IBilboMDAutoJob extends IJob {
  __t: 'BilboMdAuto'
  pdb_file: string
  psf_file?: string
  crd_file?: string
  pae_file: string
  const_inp_file?: string
  md_engine?: MDEngineEnum
  conformational_sampling: number
  rg?: number
  rg_min?: number
  rg_max?: number
}

interface IBilboMDAlphaFoldJob extends IJob {
  __t: 'BilboMdAlphaFold'
  alphafold_entities: IAlphaFoldEntity[]
  fasta_file: string
  pdb_file?: string
  psf_file?: string
  crd_file?: string
  pae_file?: string
  const_inp_file?: string
  md_engine?: MDEngineEnum
  conformational_sampling: number
  rg?: number
  rg_min?: number
  rg_max?: number
}

interface IBilboMDSANSJob extends IJob {
  __t: 'BilboMdSANS'
  pdb_file: string
  psf_file?: string
  crd_file?: string
  const_inp_file: string
  conformational_sampling: number
  d2o_fraction: number
  rg: number
  rg_min: number
  rg_max: number
  deuteration_fractions: Map<string, number>
}

interface IBilboMDScoperJob extends IJob {
  __t: 'BilboMdScoper'
  pdb_file: string
  fixc1c2: boolean
}

export type JobStatusEnum = (typeof JobStatus)[keyof typeof JobStatus]
export type NerscStatusEnum = (typeof NerscStatus)[keyof typeof NerscStatus]
export type StepStatusEnum = (typeof StepStatus)[keyof typeof StepStatus]
export type MDEngineEnum = (typeof MDEngine)[keyof typeof MDEngine]

export {
  IStepStatus,
  IBilboMDSteps,
  IAlphaFoldEntity,
  IFeedbackData,
  INerscInfo,
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDSANSJob,
  IBilboMDScoperJob
}
