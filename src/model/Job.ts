import { Document, Schema, model } from 'mongoose'
import { IUser } from './User'

interface IJob extends Document {
  title: string
  uuid: string
  status: string
  data_file: string
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
  user: IUser
}

interface IBilboMDJob extends IJob {
  psf_file: string
  crd_file: string
  const_inp_file: string
  conformational_sampling: number
  rg_min: number
  rg_max: number
}

interface IBilboMDAutoJob extends IJob {
  psf_file: string
  crd_file: string
  pae_file: string
  const_inp_file?: string
  conformational_sampling: number
  rg_min?: number
  rg_max?: number
}

interface IBilboMDScoperJob extends IJob {
  pdb_file: string
}

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: true
    },
    uuid: { type: String, required: true },
    data_file: { type: String, required: true },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: Date,
    time_completed: Date,
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

const bilboMdJobSchema = new Schema<IBilboMDJob>({
  psf_file: { type: String, required: true },
  crd_file: { type: String, required: true },
  const_inp_file: { type: String, required: true },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg_min: { type: Number, required: true, min: 10, max: 100 },
  rg_max: { type: Number, required: true, min: 10, max: 100 }
})

const bilboMdAutoJobSchema = new Schema<IBilboMDAutoJob>({
  psf_file: { type: String, required: true },
  crd_file: { type: String, required: true },
  pae_file: { type: String, required: true },
  const_inp_file: { type: String, required: false },
  conformational_sampling: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  rg_min: { type: Number, required: false, min: 10, max: 100 },
  rg_max: { type: Number, required: false, min: 10, max: 100 }
})

const bilboMdScoperJobSchema = new Schema<IBilboMDScoperJob>({
  pdb_file: { type: String, required: true }
})

const Job = model('Job', jobSchema)
const BilboMdJob = Job.discriminator('BilboMd', bilboMdJobSchema)
const BilboMdAutoJob = Job.discriminator('BilboMdAuto', bilboMdAutoJobSchema)
const BilboMdScoperJob = Job.discriminator('BilboMdScoper', bilboMdScoperJobSchema)

export {
  Job,
  IJob,
  BilboMdJob,
  IBilboMDJob,
  BilboMdAutoJob,
  IBilboMDAutoJob,
  BilboMdScoperJob,
  IBilboMDScoperJob
}
