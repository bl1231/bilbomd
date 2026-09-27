import {
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob
} from '@bilbomd/mongodb-schema'

// Narrow an IJob by the fields each job type carries. These are field
// checks, not discriminator checks — e.g. an auto job also has pdb_file.

const isBilboMDCRDJob = (job: IJob): job is IBilboMDCRDJob =>
  (job as IBilboMDCRDJob).crd_file !== undefined

const isBilboMDPDBJob = (job: IJob): job is IBilboMDPDBJob =>
  (job as IBilboMDPDBJob).pdb_file !== undefined

const isBilboMDAutoJob = (job: IJob): job is IBilboMDAutoJob =>
  (job as IBilboMDAutoJob).pae_file !== undefined

const isBilboMDAlphaFoldJob = (job: IJob): job is IBilboMDAlphaFoldJob =>
  (job as IBilboMDAlphaFoldJob).alphafold_entities !== undefined

const isBilboMDOpenFoldJob = (job: IJob): job is IBilboMDOpenFoldJob =>
  (job as IBilboMDOpenFoldJob).openfold_entities !== undefined

const isBilboMDSANSJob = (job: IJob): job is IBilboMDSANSJob =>
  (job as IBilboMDSANSJob).d2o_fraction !== undefined

export {
  isBilboMDCRDJob,
  isBilboMDPDBJob,
  isBilboMDAutoJob,
  isBilboMDAlphaFoldJob,
  isBilboMDOpenFoldJob,
  isBilboMDSANSJob
}
