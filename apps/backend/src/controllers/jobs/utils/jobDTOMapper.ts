import type {
  BilboMDJobDTO,
  BilboMDMongoJobDTO,
  BilboMDAutoDTO,
  BilboMDPDBDTO,
  BilboMDCRDDTO,
  BilboMDAlphaFoldDTO,
  BilboMDSANSDTO,
  BilboMDScoperDTO,
  JobType,
  JobStatusEnum as JobStatus,
  UserSummaryDTO,
  JobResultsDTO
} from '@bilbomd/bilbomd-types'
import type {
  IJob,
  IMultiJob,
  IUser,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDSANSJob,
  IBilboMDScoperJob
} from '@bilbomd/mongodb-schema'

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
  if (!user || !user._id) return undefined

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email
  }
}

export const mapJobMongoToDTO = (job: IJob) => {
  const jobType = mapDiscriminatorToJobType(job.__t)

  // Base shape – common to all job types
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
    md_engine: job.md_engine,
    openmm_parameters: job.openmm_parameters,
    charmm_parameters: job.charmm_parameters,
    md_constraints: job.md_constraints,
    steps: job.steps,
    feedback: job.feedback,
    assets: job.assets,
    nersc: job.nersc,
    data_file: job.data_file,
    results: job.results as JobResultsDTO
  }

  // Add job-specific properties
  switch (jobType) {
    case 'auto': {
      const autoJob = job as IBilboMDAutoJob
      return {
        ...base,
        pdb_file: autoJob.pdb_file,
        pae_file: autoJob.pae_file,
        psf_file: autoJob.psf_file,
        crd_file: autoJob.crd_file,
        const_inp_file: autoJob.const_inp_file,
        rg: autoJob.rg,
        rg_min: autoJob.rg_min,
        rg_max: autoJob.rg_max,
        conformational_sampling: autoJob.conformational_sampling
      } as BilboMDAutoDTO
    }

    case 'pdb': {
      const pdbJob = job as IBilboMDPDBJob
      return {
        ...base,
        pdb_file: pdbJob.pdb_file,
        psf_file: pdbJob.psf_file,
        crd_file: pdbJob.crd_file,
        const_inp_file: pdbJob.const_inp_file,
        rg: pdbJob.rg,
        rg_min: pdbJob.rg_min,
        rg_max: pdbJob.rg_max,
        conformational_sampling: pdbJob.conformational_sampling
      } as BilboMDPDBDTO
    }

    case 'crd': {
      const crdJob = job as IBilboMDCRDJob
      return {
        ...base,
        psf_file: crdJob.psf_file,
        crd_file: crdJob.crd_file,
        const_inp_file: crdJob.const_inp_file,
        rg: crdJob.rg,
        rg_min: crdJob.rg_min,
        rg_max: crdJob.rg_max,
        conformational_sampling: crdJob.conformational_sampling
      } as BilboMDCRDDTO
    }

    case 'alphafold': {
      const afJob = job as IBilboMDAlphaFoldJob
      return {
        ...base,
        alphafold_entities: afJob.alphafold_entities,
        fasta_file: afJob.fasta_file,
        pdb_file: afJob.pdb_file,
        psf_file: afJob.psf_file,
        crd_file: afJob.crd_file,
        pae_file: afJob.pae_file,
        conformational_sampling: afJob.conformational_sampling,
        rg: afJob.rg,
        rg_min: afJob.rg_min,
        rg_max: afJob.rg_max
      } as BilboMDAlphaFoldDTO
    }

    case 'sans': {
      const sansJob = job as IBilboMDSANSJob

      return {
        ...base,
        pdb_file: sansJob.pdb_file,
        psf_file: sansJob.psf_file,
        crd_file: sansJob.crd_file,
        const_inp_file: sansJob.const_inp_file,
        rg: sansJob.rg,
        rg_min: sansJob.rg_min,
        rg_max: sansJob.rg_max,
        d2o_fraction: sansJob.d2o_fraction,
        conformational_sampling: sansJob.conformational_sampling,
        deuteration_fractions: (sansJob.deuteration_fractions ?? []).map(
          (df) => ({
            label: df.label,
            fraction: df.fraction
          })
        )
      } as BilboMDSANSDTO
    }

    case 'scoper': {
      const scoperJob = job as IBilboMDScoperJob
      return {
        ...base,
        pdb_file: scoperJob.pdb_file,
        fixc1c2: scoperJob.fixc1c2,
        foxs_top_file: scoperJob.foxs_top_file
      } as BilboMDScoperDTO
    }

    case 'multi':
    default:
      return base as BilboMDMongoJobDTO
  }
}

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
