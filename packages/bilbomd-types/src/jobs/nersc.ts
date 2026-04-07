export const NERSC_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'UNKNOWN',
  'OUT_OF_MEMORY',
  'NODE_FAIL',
  'PREEMPTED',
  'SUSPENDED'
] as const

export type NerscStatusEnum = (typeof NERSC_JOB_STATUSES)[number]

export interface NerscInfoDTO {
  jobid: string
  state: NerscStatusEnum
  qos: string
  time_submitted: Date
  time_started?: Date
  time_completed?: Date
}
