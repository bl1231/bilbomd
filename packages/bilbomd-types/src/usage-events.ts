// BilboMD Usage Event DTOs

export type PipelineType = 'pdb' | 'crd' | 'auto' | 'sans' | 'multi'
export type EventType = 'job_submitted' | 'job_started' | 'job_completed' | 'job_failed' | 'job_cancelled'

export interface IUserLite {
  _id: string
  email?: string
  name?: string
}

export type AccessMode = 'user' | 'anonymous'

export interface IUsageEventContext {
  access_mode: AccessMode
  user?: IUserLite
  public_id?: string
  client_ip_hash?: string
}

export interface INerscLite {
  jobid?: string
  qos?: string
}

export interface UsageEventDTO {
  uuid: string
  jobId: string
  pipeline: PipelineType
  eventType: EventType
  status?: 'Submitted' | 'Pending' | 'Running' | 'Completed' | 'Error' | 'Failed' | 'Cancelled'
  durationMs?: number
  context: IUsageEventContext
  nersc?: INerscLite
  metadata?: Record<string, unknown>
  timestamp: string
}
