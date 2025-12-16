import { Schema, model } from 'mongoose'
import {
  IUsageEventContext,
  IUsageEvent
} from '../interfaces/usageEventInterface.js'

const usageEventContextSchema = new Schema<IUsageEventContext>({
  access_mode: { type: String, enum: ['user', 'anonymous'], required: true },
  user: {
    _id: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    username: { type: String, required: false },
    email: { type: String, required: false }
  },
  public_id: { type: String, required: false },
  client_ip_hash: { type: String, required: false, index: true }
})

const usageEventSchema = new Schema<IUsageEvent>(
  {
    uuid: { type: String, required: true, index: true },
    job_id: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: false,
      index: true
    },
    pipeline: {
      type: String,
      enum: ['pdb', 'crd', 'auto', 'alphafold', 'sans', 'scoper', 'multi'],
      required: true,
      index: true
    },
    event_type: {
      type: String,
      enum: [
        'job_submitted',
        'job_started',
        'job_completed',
        'job_failed',
        'job_cancelled',
        'job_resubmitted'
      ],
      required: true,
      index: true
    },
    timestamp: { type: Date, default: () => new Date(Date.now()), index: true },
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
      required: false
    },
    duration_ms: { type: Number, required: false },
    nersc: {
      qos: { type: String, required: false },
      jobid: { type: String, required: false }
    },
    context: { type: usageEventContextSchema, required: true },
    metadata: { type: Schema.Types.Mixed, required: false }
  },
  {
    timestamps: true
  }
)

usageEventSchema.index({ pipeline: 1, event_type: 1, timestamp: -1 })

usageEventSchema.index({ 'nersc.jobid': 1, timestamp: -1 })

usageEventSchema.index({
  'context.access_mode': 1,
  pipeline: 1,
  event_type: 1,
  timestamp: -1
})

usageEventSchema.index(
  { event_type: 1, pipeline: 1, duration_ms: 1, timestamp: -1 },
  {
    partialFilterExpression: {
      event_type: 'job_completed',
      duration_ms: { $gt: 0 }
    }
  }
)

export const UsageEvent = model<IUsageEvent>('UsageEvent', usageEventSchema)
export const usageEventSchemaRef = usageEventSchema
