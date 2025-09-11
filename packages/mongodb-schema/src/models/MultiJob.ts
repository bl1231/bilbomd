import { Schema, model } from 'mongoose'
import { IMultiJob } from '../interfaces'
import { stepsSchema, nerscInfoSchema } from './Job'

const multiJobSchema = new Schema(
  {
    title: { type: String, required: true },
    uuid: { type: String, required: true, unique: true },
    bilbomd_uuids: [{ type: String, required: true }],
    data_file_from: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['Submitted', 'Pending', 'Running', 'Completed', 'Error'],
      default: 'Submitted'
    },
    time_submitted: { type: Date, default: () => new Date(Date.now()) },
    time_started: { type: Date, required: false },
    time_completed: { type: Date, required: false },
    steps: { type: stepsSchema, required: true, default: {} },
    progress: { type: Number, min: 0, max: 100, default: 0 },
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

// Define the virtual field
multiJobSchema.virtual('bilbomd_jobs', {
  ref: 'Job', // Reference the base Job model
  localField: 'bilbomd_uuids', // Field in MultiJob schema
  foreignField: 'uuid' // Field in Job schema
})

// Apply the virtual field in output
multiJobSchema.set('toJSON', { virtuals: true })
multiJobSchema.set('toObject', { virtuals: true })

// Define indexes
multiJobSchema.index({ user: 1 }) // Index for queries by user

const MultiJob = model<IMultiJob>('MultiJob', multiJobSchema)

export { MultiJob }
