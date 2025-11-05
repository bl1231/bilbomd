export type PublicJobStatus = {
  publicId: string
  jobId: string
  uuid: string
  jobType: string
  status: string
  progress: number
  md_engine?: string
  submittedAt: Date
  startedAt?: Date
  completedAt?: Date
  classic?: { numEnsembles: number }
  auto?: { numEnsembles: number }
  alphafold?: { numEnsembles: number }
  scoper?: unknown
}

export type AnonJobResponse = {
  message: string
  jobid: string
  uuid: string
  md_engine: string
  publicId?: string
  resultUrl?: string
}
