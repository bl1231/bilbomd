import { Schema, model } from 'mongoose'
import { assetsSchema } from './Assets'
import {
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDScoperJob,
  IBilboMDAlphaFoldJob,
  IBilboMDSANSJob,
  IAlphaFoldEntity,
  IFeedbackData,
  INerscInfo,
  IBilboMDSteps,
  IResidueRange,
  ISegment,
  IFixedBody,
  IRigidBody,
  IMDConstraints
} from '../interfaces'
import { IOpenMMParameters } from '../interfaces/openmmInterface'

// Enum for step statuses
const stepStatusEnum = ['Waiting', 'Running', 'Success', 'Error']

// Enum for simulation engines (MD/minimize/heat implementation)
const mdEngineEnum = ['CHARMM', 'OpenMM'] as const

// Schema for step status
const stepStatusSchema = new Schema({
  status: { type: String, enum: stepStatusEnum, default: 'Waiting' },
  message: { type: String, required: false }
})

const alphaFoldEntitySchema = new Schema<IAlphaFoldEntity>({
  name: { type: String, required: true },
  sequence: { type: String, required: true },
  type: { type: String, required: true },
  copies: { type: Number, required: true }
})

const feedbackSchema = new Schema<IFeedbackData>({
  mw_saxs: { type: Number, required: true },
  mw_model: { type: Number, required: true },
  mw_err: { type: Number, required: true },
  best_model_dat_file: { type: String, required: true },
  best_ensemble_pdb_file: { type: String, required: true },
  overall_chi_square: { type: Number, required: true },
  q_ranges: [{ type: Number, required: true }],
  chi_squares_of_regions: [{ type: Number, required: true }],
  residuals_of_regions: [{ type: Number, required: true }],
  mw_feedback: { type: String, required: true },
  overall_chi_square_feedback: { type: String, required: true },
  highest_chi_square_feedback: { type: String, required: true },
  second_highest_chi_square_feedback: { type: String, required: true },
  regional_chi_square_feedback: { type: String, required: true },
  timestamp: { type: Date, default: () => new Date(Date.now()) }
})

const stepsSchema = new Schema<IBilboMDSteps>({
  alphafold: { type: stepStatusSchema, required: false },
  pdb2crd: { type: stepStatusSchema, required: false },
  pae: { type: stepStatusSchema, required: false },
  autorg: { type: stepStatusSchema, required: false },
  minimize: { type: stepStatusSchema, required: false },
  initfoxs: { type: stepStatusSchema, required: false },
  heat: { type: stepStatusSchema, required: false },
  md: { type: stepStatusSchema, required: false },
  dcd2pdb: { type: stepStatusSchema, required: false },
  pdb_remediate: { type: stepStatusSchema, required: false },
  movies: { type: stepStatusSchema, required: false },
  foxs: { type: stepStatusSchema, required: false },
  pepsisans: { type: stepStatusSchema, required: false },
  multifoxs: { type: stepStatusSchema, required: false },
  gasans: { type: stepStatusSchema, required: false },
  copy_results_to_cfs: { type: stepStatusSchema, required: false },
  results: { type: stepStatusSchema, required: false },
  email: { type: stepStatusSchema, required: false },
  nersc_prepare_slurm_batch: { type: stepStatusSchema, required: false },
  nersc_submit_slurm_batch: { type: stepStatusSchema, required: false },
  nersc_job_status: { type: stepStatusSchema, required: false },
  nersc_copy_results_to_cfs: { type: stepStatusSchema, required: false }
})

const nerscInfoSchema = new Schema<INerscInfo>({
  jobid: { type: String, required: false },
  state: { type: String, required: false },
  qos: { type: String, required: false },
  time_submitted: { type: Date, default: () => new Date(Date.now()) },
  time_started: { type: Date, required: false },
  time_completed: { type: Date, required: false }
})

const residueRangeSchema = new Schema<IResidueRange>({
  start: { type: Number, required: true },
  stop: { type: Number, required: true }
})

const segmentSchema = new Schema<ISegment>({
  chain_id: { type: String, required: true },
  residues: { type: residueRangeSchema, required: true }
})

const fixedBodySchema = new Schema<IFixedBody>({
  name: { type: String, required: true },
  segments: [{ type: segmentSchema, required: true }]
})

const rigidBodySchema = new Schema<IRigidBody>({
  name: { type: String, required: true },
  segments: [{ type: segmentSchema, required: true }]
})

const mdConstraintsSchema = new Schema<IMDConstraints>({
  fixed_bodies: [{ type: fixedBodySchema, required: false }],
  rigid_bodies: [{ type: rigidBodySchema, required: false }]
})

const openmmParametersSchema = new Schema<IOpenMMParameters>({
  minimize: {
    max_iterations: { type: Number, min: 100, max: 10000, default: 1000 }
  },
  heating: {
    start_temp: { type: Number, min: 250, max: 350, default: 300 },
    final_temp: { type: Number, min: 500, max: 1500, default: 600 },
    nsteps: { type: Number, min: 1000, max: 50000, default: 10000 },
    timestep: { type: Number, min: 0.0001, max: 0.01, default: 0.001 }
  },
  md: {
    temperature: { type: Number, min: 300, max: 1500, default: 600 },
    friction: { type: Number, min: 0.01, max: 1.0, default: 0.1 },
    nsteps: { type: Number, min: 1000, max: 10000000, default: 300000 },
    timestep: { type: Number, min: 0.0001, max: 0.01, default: 0.001 },
    k_rg: { type: Number, min: 1, max: 100, default: 10 },
    rg_report_interval: { type: Number, min: 100, max: 1000, default: 500 },
    pdb_report_interval: { type: Number, min: 100, max: 1000, default: 500 }
  }
})

const jobSchema = new Schema(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    accessMode: {
      type: String,
      enum: ['user', 'anonymous'],
      default: 'user',
      required: true
    },
    publicId: {
      type: String,
      required: function (this: any) {
        return this.accessMode === 'anonymous'
      }
    },
    data_file: { type: String, required: true },
    md_engine: {
      type: String,
      enum: mdEngineEnum,
      default: 'CHARMM',
      required: false
    },
    md_constraints: { type: mdConstraintsSchema, required: false },
    openmm_parameters: { type: openmmParametersSchema, required: false },
    status: {
      type: String,
      enum: [
        'Submitted',
        'Pending',
        'Running',
        'Completed',
        'Error',
        'Failed',
        'Cancelled'
      ],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: Date,
    time_completed: Date,
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    resubmitted_from: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: false
    },
    steps: { type: stepsSchema, required: false },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    feedback: { type: feedbackSchema, required: false },
    assets: { type: assetsSchema, required: false },
    nersc: { type: nerscInfoSchema, required: false },
    cleanup_in_progress: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    id: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
)

const bilboMdPDBJobSchema = new Schema<IBilboMDPDBJob>({
  pdb_file: { type: String, required: true },
  psf_file: { type: String, required: false },
  crd_file: { type: String, required: false },
  const_inp_file: { type: String, required: true },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'CHARMM',
    required: false
  },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg: { type: Number, required: true, min: 10, max: 100 },
  rg_min: { type: Number, required: true, min: 10, max: 100 },
  rg_max: { type: Number, required: true, min: 10, max: 100 }
})

const bilboMdCRDJobSchema = new Schema<IBilboMDCRDJob>({
  pdb_file: { type: String, required: false },
  psf_file: { type: String, required: true },
  crd_file: { type: String, required: true },
  const_inp_file: { type: String, required: true },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'CHARMM',
    required: false
  },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg: { type: Number, required: true, min: 10, max: 100 },
  rg_min: { type: Number, required: true, min: 10, max: 100 },
  rg_max: { type: Number, required: true, min: 10, max: 100 }
})

const bilboMdAutoJobSchema = new Schema<IBilboMDAutoJob>({
  pdb_file: { type: String, required: true },
  psf_file: { type: String, required: false },
  crd_file: { type: String, required: false },
  pae_file: { type: String, required: true },
  const_inp_file: { type: String, required: false },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'CHARMM',
    required: false
  },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg: { type: Number, required: false, min: 10, max: 100 },
  rg_min: { type: Number, required: false, min: 10, max: 100 },
  rg_max: { type: Number, required: false, min: 10, max: 100 }
})

const bilboMdAlphaFoldJobSchema = new Schema<IBilboMDAlphaFoldJob>({
  fasta_file: { type: String, required: true },
  alphafold_entities: [alphaFoldEntitySchema],
  pdb_file: { type: String, required: false },
  psf_file: { type: String, required: false },
  crd_file: { type: String, required: false },
  pae_file: { type: String, required: false },
  const_inp_file: { type: String, required: false },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'CHARMM',
    required: false
  },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg: { type: Number, required: false, min: 10, max: 100 },
  rg_min: { type: Number, required: false, min: 10, max: 100 },
  rg_max: { type: Number, required: false, min: 10, max: 100 }
})

const bilboMdSANSJobSchema = new Schema<IBilboMDSANSJob>({
  pdb_file: { type: String, required: true },
  psf_file: { type: String, required: false },
  crd_file: { type: String, required: false },
  const_inp_file: { type: String, required: true },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg: { type: Number, required: true, min: 10, max: 100 },
  rg_min: { type: Number, required: true, min: 10, max: 100 },
  rg_max: { type: Number, required: true, min: 10, max: 100 },
  d2o_fraction: { type: Number, required: true },
  deuteration_fractions: {
    type: Schema.Types.Mixed,
    required: true
  }
})

const bilboMdScoperJobSchema = new Schema<IBilboMDScoperJob>({
  pdb_file: { type: String, required: true },
  fixc1c2: { type: Boolean, required: true }
})

jobSchema.index({ uuid: 1 })

const Job = model<IJob>('Job', jobSchema)
const BilboMdPDBJob = Job.discriminator('BilboMdPDB', bilboMdPDBJobSchema)
const BilboMdCRDJob = Job.discriminator('BilboMdCRD', bilboMdCRDJobSchema)
const BilboMdJob = Job.discriminator('BilboMd', bilboMdCRDJobSchema)
const BilboMdAutoJob = Job.discriminator('BilboMdAuto', bilboMdAutoJobSchema)
const BilboMdAlphaFoldJob = Job.discriminator(
  'BilboMdAlphaFold',
  bilboMdAlphaFoldJobSchema
)
const BilboMdSANSJob = Job.discriminator('BilboMdSANS', bilboMdSANSJobSchema)
const BilboMdScoperJob = Job.discriminator(
  'BilboMdScoper',
  bilboMdScoperJobSchema
)

export {
  Job,
  BilboMdJob,
  BilboMdPDBJob,
  BilboMdCRDJob,
  BilboMdAutoJob,
  BilboMdScoperJob,
  BilboMdAlphaFoldJob,
  BilboMdSANSJob,
  stepsSchema,
  nerscInfoSchema,
  mdConstraintsSchema,
  fixedBodySchema,
  rigidBodySchema,
  segmentSchema,
  residueRangeSchema
}
