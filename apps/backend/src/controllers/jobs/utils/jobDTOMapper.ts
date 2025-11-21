import type {
  BilboMDJobDTO,
  BilboMDMongoJobDTO,
  JobType,
  JobStatusEnum as JobStatus,
  UserSummaryDTO,
  JobResultsDTO
} from '@bilbomd/bilbomd-types'
import type { IJob, IMultiJob, IUser } from '@bilbomd/mongodb-schema'

/**
 * Map Mongo discriminator (__t) → DTO JobType
 */
export const mapDiscriminatorToJobType = (__t?: string): JobType => {
  switch (__t) {
    case 'BilboMdPDB':
      return 'pdb'
    case 'BilboMdCRD':
      return 'crd'
    case 'BilboMdAuto':
      return 'auto'
    case 'BilboMdAlphaFold':
      return 'alphafold'
    case 'BilboMdSANS':
      return 'sans'
    case 'BilboMdScoper':
      return 'scoper'
    case 'MultiJob':
      return 'multi'
    default:
      return 'multi'
  }
}

export const mapStatus = (status: string): JobStatus => {
  // if your DTO union is stricter, normalize here
  // e.g. capitalisation, mapping numeric codes, etc.
  return status as JobStatus
}

export const mapUserToSummary = (
  user?: IUser | null
): UserSummaryDTO | undefined => {
  if (!user) return undefined

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email
  }
}

/**
 * Map a single IJob (from Job collection) into the DTO's `mongo` portion.
 * This should match your BilboMDMongoJobDTO / specific job DTOs.
 */
export const mapJobMongoToDTO = (job: IJob) => {
  const jobType = mapDiscriminatorToJobType(job.__t)

  // Base shape – extend per jobType as needed
  const base = {
    id: job._id.toString(),
    jobType,
    title: job.title,
    uuid: job.uuid,
    bilbomd_uuids: [],
    data_file_from: '',
    access_mode: job.access_mode,
    public_id: job.public_id,
    status: mapStatus(job.status),
    time_submitted: job.time_submitted,
    time_started: job.time_started ?? undefined,
    time_completed: job.time_completed ?? undefined,
    progress: job.progress ?? 0,
    cleanup_in_progress: job.cleanup_in_progress ?? false,
    // you can fill these more strongly later:
    md_engine: job.md_engine,
    openmm_parameters: job.openmm_parameters,
    md_constraints: job.md_constraints,
    steps: job.steps,
    feedback: job.feedback,
    assets: job.assets,
    nersc: job.nersc,
    data_file: job.data_file,
    results: job.results as JobResultsDTO
  }

  // You can specialize by jobType if needed:
  // if (jobType === 'alphafold') { ... }

  return base as BilboMDMongoJobDTO
}

/**
 * Map a MultiJob document into the same outer BilboMDJobDTO shape,
 * or into a dedicated MultiJob DTO if you have one.
 */
export const mapMultiJobMongoToDTO = (
  multiJob: IMultiJob
): BilboMDMongoJobDTO => {
  const jobType: JobType = 'multi'
  return {
    id: multiJob._id.toString(),
    jobType,
    title: multiJob.title,
    uuid: multiJob.uuid,
    bilbomd_uuids: multiJob.bilbomd_uuids,
    data_file_from: multiJob.data_file_from,
    status: mapStatus(multiJob.status),
    time_submitted: multiJob.time_submitted,
    time_started: multiJob.time_started ?? undefined,
    time_completed: multiJob.time_completed ?? undefined,
    progress: multiJob.progress ?? 0,
    steps: multiJob.steps,
    nersc: multiJob.nersc
  } as BilboMDMongoJobDTO
}

/**
 * Full DTO for a single Job (Mongo + username + id)
 */
export const buildBilboMDJobDTO = (opts: {
  jobId: string
  mongo: IJob
  username?: string
}): BilboMDJobDTO => {
  const { jobId, mongo, username } = opts

  const mongoDTO = mapJobMongoToDTO(mongo)
  const userSummary = mapUserToSummary(mongo.user as IUser | undefined)

  return {
    id: jobId,
    username: username ?? userSummary?.username ?? 'unknown',
    mongo: {
      ...mongoDTO,
      user: userSummary
    }
  }
}

/**
 * DTO for MultiJob – either reuse BilboMDJobDTO or have a dedicated DTO.
 * Here I show reuse for simplicity.
 */
export const buildMultiJobDTO = (opts: {
  jobId: string
  mongo: IMultiJob
  username?: string
}): BilboMDJobDTO => {
  const { jobId, mongo, username } = opts
  const mongoDTO = mapMultiJobMongoToDTO(mongo)
  const userSummary = mapUserToSummary(mongo.user as IUser | undefined)

  return {
    id: jobId,
    username: username ?? userSummary?.username ?? 'unknown',
    mongo: {
      ...mongoDTO,
      user: userSummary
    }
  }
}
