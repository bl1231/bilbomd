import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job, IJob } from '@bilbomd/mongodb-schema'
import type {
  PublicJobStatus,
  PublicJobInputsDTO,
  JobResultsDTO,
  JobStepsDTO
} from '@bilbomd/bilbomd-types'
import {
  mapDiscriminatorToJobType,
  mapJobMongoToDTO
} from '../jobs/utils/jobDTOMapper.js'

// Whitelist the input fields a public viewer may see; the full DTO also
// carries user details, which must never leave through this endpoint.
const pickPublicInputs = (job: IJob): PublicJobInputsDTO => {
  const dto = mapJobMongoToDTO(job) as PublicJobInputsDTO
  return {
    data_file: dto.data_file,
    pdb_file: dto.pdb_file,
    psf_file: dto.psf_file,
    crd_file: dto.crd_file,
    pae_file: dto.pae_file,
    fasta_file: dto.fasta_file,
    query_json_file: dto.query_json_file,
    const_inp_file: dto.const_inp_file,
    openmm_parameters: dto.openmm_parameters,
    charmm_parameters: dto.charmm_parameters,
    rg: dto.rg,
    rg_min: dto.rg_min,
    rg_max: dto.rg_max,
    conformational_sampling: dto.conformational_sampling,
    d2o_fraction: dto.d2o_fraction,
    bilbomd_uuids: dto.bilbomd_uuids
  }
}
import { publicJobQuery } from './utils/publicJobQuery.js'

const getPublicJobById = async (req: Request, res: Response) => {
  const rawPublicId = req.params.publicId

  // Ensure publicId is a string
  const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
    const job = await Job.findOne(publicJobQuery(publicId)).lean<IJob>().exec()

    if (!job) {
      res.status(404).json({ message: `No job matches publicId ${publicId}.` })
      return
    }

    const jobType = mapDiscriminatorToJobType(job.__t)

    const response: PublicJobStatus = {
      publicId,
      jobId: job._id.toString(),
      uuid: job.uuid,
      jobType: jobType,
      status: job.status,
      progress: job.progress ?? 0,
      md_engine: job.md_engine,
      submittedAt: job.time_submitted,
      startedAt: job.time_started,
      completedAt: job.time_completed,
      steps: job.steps as JobStepsDTO | undefined,
      results: job.results as JobResultsDTO,
      title: job.title,
      inputs: pickPublicInputs(job)
    }

    res.status(200).json(response)
  } catch (error) {
    logger.error(`Error retrieving public job: ${error}`)
    res.status(500).json({ message: 'Failed to retrieve public job.' })
  }
}

export { getPublicJobById }
