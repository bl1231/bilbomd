import { JobResultsDTO } from './results'
import { JobType, JobStatusEnum } from './jobs'

export type PublicJobStatus = {
  publicId: string
  jobId: string
  uuid: string
  jobType: JobType
  status: JobStatusEnum
  progress: number
  md_engine?: string
  submittedAt: Date
  startedAt?: Date
  completedAt?: Date
  results?: JobResultsDTO
}

export type AnonJobResponse = {
  message: string
  jobid: string
  uuid: string
  md_engine: string
  publicId?: string
  resultUrl?: string
}

export type FoxsDataPoint = {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

export type FoxsData = {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
}
