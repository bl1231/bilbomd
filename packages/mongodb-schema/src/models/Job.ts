import { randomUUID } from 'node:crypto'
import { Schema, model } from 'mongoose'
import { assetsSchema } from './Assets'
import { resultsSchema } from './Results'
import { stepsSchema } from './JobSteps'
import {
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDScoperJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDBioEmuJob,
  IBilboMDSANSJob,
  IAlphaFoldEntity,
  IBioEmuParameters,
  IOpenFoldEntity,
  IFeedbackData,
  IFeedbackFinding,
  IFeedbackRegion,
  IFeedbackModel,
  IFeedbackMw,
  INerscInfo,
  IBilboMDSteps,
  IResidueRange,
  ISegment,
  IFixedBody,
  IRigidBody,
  IMDConstraints,
  IChainMolType
} from '../interfaces'
import { openmmParametersSchema } from './OpenMM'
import { charmmParametersSchema } from './CHARMM'

// Enum for simulation engines (MD/minimize/heat implementation)
const mdEngineEnum = ['CHARMM', 'OpenMM'] as const

const alphaFoldEntitySchema = new Schema<IAlphaFoldEntity>({
  name: { type: String, required: true },
  sequence: { type: String, required: true },
  type: { type: String, required: true },
  copies: { type: Number, required: true }
})

const openFoldEntitySchema = new Schema<IOpenFoldEntity>({
  name: { type: String, required: true },
  sequence: { type: String, required: true },
  type: { type: String, enum: ['Protein', 'DNA', 'RNA'], required: true },
  copies: { type: Number, required: true }
})

const feedbackFindingSchema = new Schema<IFeedbackFinding>(
  {
    code: { type: String, required: true },
    severity: {
      type: String,
      enum: ['good', 'info', 'warning', 'problem'],
      required: true
    },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    region: { type: String, enum: ['low', 'mid', 'high'], required: false }
  },
  { _id: false }
)

const feedbackRegionSchema = new Schema<IFeedbackRegion>(
  {
    name: { type: String, enum: ['low', 'mid', 'high'], required: true },
    q_min: { type: Number, required: true },
    q_max: { type: Number, required: true },
    n_points: { type: Number, required: true },
    chi_square: { type: Number, required: true },
    mean_residual: { type: Number, required: true }
  },
  { _id: false }
)

const feedbackModelSchema = new Schema<IFeedbackModel>(
  {
    states: { type: Number, required: true },
    file: { type: String, required: true },
    chi_square: { type: Number, required: true },
    selected: { type: Boolean, required: true }
  },
  { _id: false }
)

const feedbackMwSchema = new Schema<IFeedbackMw>(
  {
    model_kda: { type: Number, default: null },
    saxs_kda: { type: Number, default: null },
    diff_fraction: { type: Number, default: null },
    method: { type: String, required: true },
    particle: { type: String, enum: ['protein', 'rna'], default: null },
    confidence: { type: String, enum: ['normal', 'low'], default: null },
    nucleic_fraction: { type: Number, default: null },
    model_pdb_file: { type: String, default: null },
    qmax_used: { type: Number, default: null },
    guinier: {
      type: new Schema(
        {
          rg: { type: Number, required: true },
          i0: { type: Number, default: null },
          r2: { type: Number, default: null },
          qmin: { type: Number, default: null },
          qmax: { type: Number, default: null }
        },
        { _id: false }
      ),
      default: null
    },
    reason: { type: String, default: null }
  },
  { _id: false }
)

// The molecular-weight fields and the per-region sentences are optional: the
// MW comparison is advisory and can be unavailable, and data covering a
// single q-region have no "second highest" region.
const feedbackSchema = new Schema<IFeedbackData>({
  mw_saxs: { type: Number, default: null },
  mw_model: { type: Number, default: null },
  mw_err: { type: Number, default: null },
  best_model_dat_file: { type: String, required: true },
  best_ensemble_pdb_file: { type: String, default: null },
  overall_chi_square: { type: Number, required: true },
  q_ranges: [{ type: Number, required: true }],
  chi_squares_of_regions: [{ type: Number, required: true }],
  residuals_of_regions: [{ type: Number, required: true }],
  mw_feedback: { type: String, required: true },
  overall_chi_square_feedback: { type: String, required: true },
  highest_chi_square_feedback: { type: String, default: null },
  second_highest_chi_square_feedback: { type: String, default: null },
  regional_chi_square_feedback: { type: String, default: null },
  timestamp: { type: Date, default: () => new Date(Date.now()) },
  version: { type: Number, required: false },
  findings: { type: [feedbackFindingSchema], default: undefined },
  regions: { type: [feedbackRegionSchema], default: undefined },
  models: { type: [feedbackModelSchema], default: undefined },
  mw: { type: feedbackMwSchema, required: false }
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

const chainMolTypeSchema = new Schema<IChainMolType>(
  {
    chain_id: { type: String, required: true },
    mol_type: {
      type: String,
      enum: ['PRO', 'DNA', 'RNA', 'CAR'],
      required: true
    }
  },
  { _id: false }
)

const mdConstraintsSchema = new Schema<IMDConstraints>({
  fixed_bodies: [{ type: fixedBodySchema, required: false }],
  rigid_bodies: [{ type: rigidBodySchema, required: false }],
  chain_mol_types: { type: [chainMolTypeSchema], default: undefined }
})

const jobSchema = new Schema(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    access_mode: {
      type: String,
      enum: ['user', 'anonymous'],
      default: 'user',
      required: true
    },
    public_id: {
      type: String,
      required: function (this: any) {
        return this.access_mode === 'anonymous'
      }
    },
    client_ip_hash: {
      type: String,
      required: function (this: any) {
        return this.access_mode === 'anonymous'
      },
      index: true
    },
    // Unguessable capability token granting unauthenticated read access to
    // this job's results page (used in job-complete emails). Jobs created
    // before this field existed won't have one.
    results_token: {
      type: String,
      default: () => randomUUID()
    },
    data_file: { type: String, required: true },
    md_constraints: { type: mdConstraintsSchema, required: false },
    openmm_parameters: { type: openmmParametersSchema, required: false },
    openmm_forcefield: { type: [String], required: false },
    charmm_parameters: { type: charmmParametersSchema, required: false },
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
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: function (this: any) {
          return this.access_mode === 'user'
        }
      },
      username: {
        type: String,
        required: function (this: any) {
          return this.access_mode === 'user'
        }
      },
      email: {
        type: String,
        required: function (this: any) {
          return this.access_mode === 'user'
        }
      }
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
    cleanup_in_progress: { type: Boolean, default: false },
    results_ready: { type: Boolean },
    results: { type: resultsSchema, required: false }
  },
  {
    timestamps: true,
    id: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        // Ensure the `user` field includes only minimal details
        if (ret.user && typeof ret.user === 'object' && ret.user._id) {
          ret.user = {
            _id: ret.user._id,
            username: ret.user.username,
            email: ret.user.email
          }
        }

        return ret
      }
    },
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

const bilboMdOpenFoldJobSchema = new Schema<IBilboMDOpenFoldJob>({
  query_json_file: { type: String, required: true },
  openfold_entities: [openFoldEntitySchema],
  pdb_file: { type: String, required: false },
  psf_file: { type: String, required: false },
  crd_file: { type: String, required: false },
  pae_file: { type: String, required: false },
  const_inp_file: { type: String, required: false },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'OpenMM',
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

const bioEmuParametersSchema = new Schema<IBioEmuParameters>(
  {
    rgs: [{ type: Number, required: true }],
    num_samples_per_rg: { type: Number, required: true, min: 1, max: 500 },
    batch_size: { type: Number, required: true, min: 1 },
    num_steps: { type: Number, required: true, min: 1 },
    num_gd_steps: { type: Number, required: true, min: 0 },
    rg_weight: { type: Number, required: true },
    default_potentials: { type: Boolean, required: true }
  },
  { _id: false }
)

const bilboMdBioEmuJobSchema = new Schema<IBilboMDBioEmuJob>({
  bioemu_entities: [openFoldEntitySchema],
  system_yaml_file: { type: String, required: true },
  bioemu_parameters: { type: bioEmuParametersSchema, required: true },
  md_engine: {
    type: String,
    enum: mdEngineEnum,
    default: 'OpenMM',
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
jobSchema.index({ client_ip_hash: 1, access_mode: 1, status: 1 })
jobSchema.index({ results_token: 1 }, { sparse: true })

const Job = model<IJob>('Job', jobSchema)
const BilboMdPDBJob = Job.discriminator('BilboMdPDB', bilboMdPDBJobSchema)
const BilboMdCRDJob = Job.discriminator('BilboMdCRD', bilboMdCRDJobSchema)
const BilboMdJob = Job.discriminator('BilboMd', bilboMdCRDJobSchema)
const BilboMdAutoJob = Job.discriminator('BilboMdAuto', bilboMdAutoJobSchema)
const BilboMdAlphaFoldJob = Job.discriminator(
  'BilboMdAlphaFold',
  bilboMdAlphaFoldJobSchema
)
const BilboMdOpenFoldJob = Job.discriminator(
  'BilboMdOpenFold',
  bilboMdOpenFoldJobSchema
)
const BilboMdBioEmuJob = Job.discriminator(
  'BilboMdBioEmu',
  bilboMdBioEmuJobSchema
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
  BilboMdOpenFoldJob,
  BilboMdBioEmuJob,
  BilboMdSANSJob,
  nerscInfoSchema,
  mdConstraintsSchema,
  fixedBodySchema,
  rigidBodySchema,
  segmentSchema,
  residueRangeSchema
}
