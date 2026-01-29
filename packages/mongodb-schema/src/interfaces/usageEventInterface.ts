import { Types } from 'mongoose'

export type PipelineType =
  | 'pdb'
  | 'crd'
  | 'auto'
  | 'alphafold'
  | 'sans'
  | 'scoper'
  | 'multi'

export type EventType =
  | 'job_submitted'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'job_resubmitted'

export interface IUsageEventContext {
  access_mode: 'user' | 'anonymous'
  user?: {
    _id: Types.ObjectId
    username: string
    email: string
  }
  public_id?: string
  client_ip_hash?: string
}

export interface IUsageEvent {
  uuid: string
  job_id?: Types.ObjectId
  pipeline: PipelineType
  event_type: EventType
  timestamp: Date
  status?:
    | 'Submitted'
    | 'Pending'
    | 'Running'
    | 'Completed'
    | 'Error'
    | 'Failed'
    | 'Cancelled'
  duration_ms?: number
  nersc?: {
    qos?: string
    jobid?: string
  }
  context: IUsageEventContext
  metadata?: Record<string, unknown>
}
