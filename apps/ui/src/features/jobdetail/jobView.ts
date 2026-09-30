import type {
  BilboMDJobDTO,
  JobFeedbackDTO,
  JobResultsDTO,
  JobStatusEnum,
  JobStepsDTO,
  JobType,
  MDConstraintsDTO,
  PublicJobInputsDTO,
  PublicJobStatus
} from '@bilbomd/bilbomd-types'

// One shape for the job page, whichever endpoint the job came from. The
// owner DTO nests everything under `mongo`; the public one is flat.
export type JobView = {
  id: string
  jobType: JobType
  title?: string
  uuid: string
  status: JobStatusEnum
  progress: number
  md_engine?: string
  md_constraints?: MDConstraintsDTO
  submittedAt: Date
  startedAt?: Date
  completedAt?: Date
  steps?: JobStepsDTO
  results?: JobResultsDTO
  inputs: PublicJobInputsDTO
  // Owner-only fields; the public endpoint doesn't send these
  feedback?: JobFeedbackDTO
  resultsReady?: boolean
  accessMode?: 'user' | 'anonymous'
  publicId?: string
}

const pickInputs = (src: PublicJobInputsDTO): PublicJobInputsDTO => ({
  data_file: src.data_file,
  pdb_file: src.pdb_file,
  psf_file: src.psf_file,
  crd_file: src.crd_file,
  pae_file: src.pae_file,
  fasta_file: src.fasta_file,
  query_json_file: src.query_json_file,
  const_inp_file: src.const_inp_file,
  openmm_parameters: src.openmm_parameters,
  charmm_parameters: src.charmm_parameters,
  rg: src.rg,
  rg_min: src.rg_min,
  rg_max: src.rg_max,
  conformational_sampling: src.conformational_sampling,
  d2o_fraction: src.d2o_fraction,
  bilbomd_uuids: src.bilbomd_uuids
})

export const toJobView = (dto: BilboMDJobDTO): JobView => {
  const m = dto.mongo
  return {
    id: m.id,
    jobType: m.jobType,
    title: m.title,
    uuid: m.uuid,
    status: m.status,
    progress:
      typeof m.progress === 'number' && isFinite(m.progress) ? m.progress : 0,
    md_engine: m.md_engine,
    md_constraints: m.md_constraints,
    submittedAt: m.time_submitted,
    startedAt: m.time_started,
    completedAt: m.time_completed,
    steps: m.steps,
    results: m.results,
    // Job-type-specific fields live on the union members; the whitelist
    // copies only the ones that exist on this job.
    inputs: pickInputs(m as PublicJobInputsDTO),
    feedback: m.feedback,
    resultsReady: m.results_ready,
    accessMode: m.access_mode,
    publicId: m.public_id
  }
}

export const fromPublicJob = (p: PublicJobStatus): JobView => ({
  id: p.jobId,
  jobType: p.jobType,
  title: p.title,
  uuid: p.uuid,
  status: p.status,
  progress: p.progress ?? 0,
  md_engine: p.md_engine,
  md_constraints: p.md_constraints,
  submittedAt: p.submittedAt,
  startedAt: p.startedAt,
  completedAt: p.completedAt,
  steps: p.steps,
  results: p.results,
  // Older backends don't send inputs yet
  inputs: p.inputs ? pickInputs(p.inputs) : {},
  publicId: p.publicId
})
