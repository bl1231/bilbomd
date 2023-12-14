import { Document, Schema, model } from 'mongoose'
import { IUser } from './User'

interface IJob extends Document {
  title: string
  uuid: string
  status: string
  psf_file: string
  crd_file: string
  data_file: string
  time_submitted: Date
  time_started: Date
  time_completed: Date
  user: IUser
}

interface IBilboMDJob extends IJob {
  const_inp_file: string
  conformational_sampling: number
  rg_min: number
  rg_max: number
}

interface IBilboMDAutoJob extends IBilboMDJob {
  pae_file: string
}

interface IBilboMDScoperJob extends Document {
  title: string
  uuid: string
  status: string
  pdb_file: string
  data_file: string
  time_submitted: Date
  time_started: Date
  time_completed: Date
  user: IUser
}

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    psf_file: { type: String, required: true },
    crd_file: { type: String, required: true },
    data_file: { type: String, required: true },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: { type: Date },
    time_completed: { type: Date },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

const bilboMdJobSchema = new Schema<IBilboMDJob>(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    psf_file: { type: String, required: true },
    crd_file: { type: String, required: true },
    const_inp_file: { type: String },
    data_file: { type: String, required: true },
    conformational_sampling: {
      type: Number,
      enum: [1, 2, 3, 4],
      default: 1
    },
    rg_min: { type: Number, required: true, minimum: 10, maximum: 100 },
    rg_max: { type: Number, required: true, minimum: 10, maximum: 100 },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: { type: Date },
    time_completed: { type: Date },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

const bilboMdAutoJobSchema = new Schema<IBilboMDAutoJob>(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    psf_file: { type: String, required: true },
    crd_file: { type: String, required: true },
    pae_file: { type: String, required: true },
    const_inp_file: { type: String },
    data_file: { type: String, required: true },
    conformational_sampling: {
      type: Number,
      enum: [1, 2, 3, 4],
      default: 1
    },
    rg_min: { type: Number, required: false },
    rg_max: { type: Number, required: false },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: { type: Date },
    time_completed: { type: Date },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

const bilboMdScoperJobSchema = new Schema<IBilboMDScoperJob>(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    pdb_file: { type: String, required: true },
    data_file: { type: String, required: true },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: { type: Date },
    time_completed: { type: Date },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

const Job = model<IJob>('Job', jobSchema, 'jobs')
const BilboMDJob = model<IBilboMDJob>('BilboMDJob', bilboMdJobSchema, 'jobs')
const BilboMDAutoJob = model<IBilboMDAutoJob>(
  'BilboMDAutoJob',
  bilboMdAutoJobSchema,
  'jobs'
)
const BilboMDScoperJob = model<IBilboMDScoperJob>(
  'BilboMDScoperJob',
  bilboMdScoperJobSchema,
  'jobs'
)

export {
  Job,
  IJob,
  BilboMDJob,
  IBilboMDJob,
  BilboMDAutoJob,
  IBilboMDAutoJob,
  BilboMDScoperJob,
  IBilboMDScoperJob
}
