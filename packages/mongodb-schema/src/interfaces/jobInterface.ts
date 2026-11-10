import { Document, Types } from 'mongoose'
import { IUser } from './userInterface'
import { IOpenMMParameters } from './openmmInterface'
import { ICHARMMParameters } from './charmmInterface'
import { IAssets } from './assetsInterface'
import { IJobResults } from './resultsInterface'
import { IBilboMDSteps, IStepStatus } from './jobStepInterface'

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

export const AccessMode = {
  User: 'user',
  Anonymous: 'anonymous'
} as const

interface IAlphaFoldEntity {
  name: string
  sequence: string
  type: string
  copies: number
}

interface IOpenFoldEntity {
  name: string
  sequence: string
  type: 'Protein' | 'DNA' | 'RNA'
  copies: number
}

// BioEmu2 (sequence-in) entities: same shape as OpenFold3's
type IBioEmuEntity = IOpenFoldEntity

// Settings for Rg-steered BioEmu2 sampling (#1200). Defaults are the Phase 0
// "steer" config: 50 denoising steps, 5 guidance steps, BioEmu2's default
// physicality potentials plus a Cα-Rg potential per target.
interface IBioEmuParameters {
  rgs: number[]
  num_samples_per_rg: number
  batch_size: number
  num_steps: number
  num_gd_steps: number
  rg_weight: number
  default_potentials: boolean
}

type IFeedbackSeverity = 'good' | 'info' | 'warning' | 'problem'
type IFeedbackRegionName = 'low' | 'mid' | 'high'

// One conclusion of the fit assessment. The wording is written by the
// assessment script; clients style it by severity.
interface IFeedbackFinding {
  code: string
  severity: IFeedbackSeverity
  title: string
  detail: string
  region?: IFeedbackRegionName
}

interface IFeedbackRegion {
  name: IFeedbackRegionName
  q_min: number
  q_max: number
  n_points: number
  chi_square: number
  mean_residual: number
}

// Chi-square of each MultiFoXS ensemble size, and which one was assessed
interface IFeedbackModel {
  states: number
  file: string
  chi_square: number
  selected: boolean
}

interface IFeedbackGuinier {
  rg: number
  i0: number | null
  r2: number | null
  qmin: number | null
  qmax: number | null
}

// Advisory comparison of the model's mass with a SAXS estimate
interface IFeedbackMw {
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
  guinier: IFeedbackGuinier | null
  // Why the estimate is missing or low-confidence
  reason: string | null
}

interface IFeedbackData {
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
  findings?: IFeedbackFinding[]
  regions?: IFeedbackRegion[]
  models?: IFeedbackModel[]
  mw?: IFeedbackMw
}

interface INerscInfo {
  jobid: string
  state: NerscStatusEnum
  qos: string
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
}

interface IResidueRange {
  start: number
  stop: number
}

interface ISegment {
  chain_id: string
  residues: IResidueRange
}

interface IFixedBody {
  name: string
  segments: ISegment[]
}

interface IRigidBody {
  name: string
  segments: ISegment[]
}

type ChainMolType = 'PRO' | 'DNA' | 'RNA' | 'CAR'

interface IChainMolType {
  chain_id: string
  mol_type: ChainMolType
}

interface IMDConstraints {
  fixed_bodies?: IFixedBody[]
  rigid_bodies?: IRigidBody[]
  chain_mol_types?: IChainMolType[]
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
    | 'BilboMdOpenFold'
    | 'BilboMdBioEmu'
    | 'BilboMdSANS'
  title: string
  uuid: string
  access_mode: AccessModeEnum
  public_id?: string
  results_token?: string
  client_ip_hash?: string
  status: JobStatusEnum
  data_file: string
  md_engine?: MDEngineEnum
  openmm_parameters?: IOpenMMParameters
  openmm_forcefield?: string[]
  charmm_parameters?: ICHARMMParameters
  md_constraints?: IMDConstraints
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
  user?: IUser | Types.ObjectId
  resubmitted_from?: IJob | Types.ObjectId
  steps?: IBilboMDSteps
  progress: number
  feedback?: IFeedbackData
  assets?: IAssets
  nersc?: INerscInfo
  cleanup_in_progress: boolean
  results_ready?: boolean
  results?: IJobResults
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

interface IBilboMDOpenFoldJob extends IJob {
  __t: 'BilboMdOpenFold'
  openfold_entities: IOpenFoldEntity[]
  query_json_file: string
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

interface IBilboMDBioEmuJob extends IJob {
  __t: 'BilboMdBioEmu'
  bioemu_entities: IBioEmuEntity[]
  system_yaml_file: string
  bioemu_parameters: IBioEmuParameters
  // OpenMM restrained minimization polishes the final ensemble members
  md_engine?: MDEngineEnum
  conformational_sampling: number
  rg?: number
  rg_min?: number
  rg_max?: number
}

interface IBilboMDScoperJob extends IJob {
  __t: 'BilboMdScoper'
  pdb_file: string
  fixc1c2: boolean
  foxs_top_file?: string
}

export type JobStatusEnum = (typeof JobStatus)[keyof typeof JobStatus]
export type NerscStatusEnum = (typeof NerscStatus)[keyof typeof NerscStatus]
export type MDEngineEnum = (typeof MDEngine)[keyof typeof MDEngine]
export type AccessModeEnum = (typeof AccessMode)[keyof typeof AccessMode]

export {
  IStepStatus,
  IBilboMDSteps,
  IAlphaFoldEntity,
  IOpenFoldEntity,
  IBioEmuEntity,
  IBioEmuParameters,
  IFeedbackData,
  IFeedbackFinding,
  IFeedbackRegion,
  IFeedbackModel,
  IFeedbackGuinier,
  IFeedbackMw,
  IFeedbackSeverity,
  IFeedbackRegionName,
  INerscInfo,
  IResidueRange,
  ISegment,
  IFixedBody,
  IRigidBody,
  IMDConstraints,
  IChainMolType,
  ChainMolType,
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDBioEmuJob,
  IBilboMDScoperJob
}
