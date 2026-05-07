import React from 'react'
import type {
  BilboMDJobDTO,
  BilboMDAutoDTO,
  BilboMDSANSDTO,
  BilboMDPDBDTO,
  BilboMDCRDDTO,
  BilboMDScoperDTO,
  BilboMDAlphaFoldDTO,
  BilboMDOpenFoldDTO
} from '@bilbomd/bilbomd-types'
import type { JobHandler, MongoDBProperty } from '../types'
import { ConstraintFileChip } from '../components/ConstraintFileChip'

const getMdRunCount = (job: BilboMDJobDTO): number => {
  if (job.mongo.md_engine === 'CHARMM') {
    return job.mongo.charmm_parameters?.md?.rgyr?.length ?? 0
  }

  return job.mongo.openmm_parameters?.md?.rgyr?.length ?? 0
}

const getRgValues = (job: BilboMDJobDTO): string | undefined => {
  const engine = job.mongo.md_engine ?? 'CHARMM'
  const rgyr =
    engine === 'CHARMM'
      ? job.mongo.charmm_parameters?.md?.rgyr
      : job.mongo.openmm_parameters?.md?.rgyr

  if (!rgyr || rgyr.length === 0) {
    return undefined
  }

  return rgyr.map((value) => `${value} Å`).join(', ')
}

const getConformationCount = (job: BilboMDJobDTO): number => {
  const engine = job.mongo.md_engine ?? 'CHARMM'

  if (engine === 'CHARMM') {
    const mdParams = job.mongo.charmm_parameters?.md
    const nsteps = mdParams?.nsteps
    const rgyrLength = mdParams?.rgyr?.length
    const reportInterval = mdParams?.pdb_report_interval

    if (!nsteps || !rgyrLength || !reportInterval || reportInterval <= 0) {
      return 0
    }

    return (nsteps * rgyrLength) / reportInterval
  }

  if (engine === 'OpenMM') {
    const mdParams = job.mongo.openmm_parameters?.md
    const nsteps = mdParams?.nsteps
    const rgyrLength = mdParams?.rgyr?.length
    const reportInterval = mdParams?.pdb_report_interval

    if (!nsteps || !rgyrLength || !reportInterval || reportInterval <= 0) {
      return 0
    }

    return (nsteps * rgyrLength) / reportInterval
  }

  return 0
}

export const createAutoJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD Auto',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDAutoDTO

    return [
      { label: 'PDB file', value: specificJob.pdb_file },
      { label: 'PSF file', value: specificJob.psf_file },
      { label: 'CRD file', value: specificJob.crd_file },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})

export const createSansJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD SANS',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDSANSDTO

    return [
      { label: 'PDB file', value: specificJob.pdb_file },
      {
        label: 'Solvent D20 Fraction',
        value: specificJob.d2o_fraction,
        suffix: '%'
      },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Rg min', value: specificJob.rg_min, suffix: 'Å' },
      { label: 'Rg max', value: specificJob.rg_max, suffix: 'Å' },
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})

export const createPdbJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD Classic w/PDB',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDPDBDTO

    return [
      { label: 'PDB file', value: specificJob.pdb_file },
      { label: 'PSF file', value: specificJob.psf_file },
      { label: 'CRD file', value: specificJob.crd_file },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})

export const createCrdJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD Classic w/CRD/PSF',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDCRDDTO

    return [
      { label: 'PDB file', value: specificJob.pdb_file },
      { label: 'PSF file', value: specificJob.psf_file },
      { label: 'CRD file', value: specificJob.crd_file },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})

export const createScoperJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD Scoper',

  getJobSpecificProperties: (job: BilboMDJobDTO): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDScoperDTO

    return [{ label: 'PDB file', value: specificJob.pdb_file }]
  }
})

export const createAlphaFoldJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD AlphaFold',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDAlphaFoldDTO

    return [
      { label: 'FASTA file', value: specificJob.fasta_file },
      { label: 'PDB file', value: specificJob.pdb_file },
      { label: 'PSF file', value: specificJob.psf_file },
      { label: 'CRD file', value: specificJob.crd_file },
      { label: 'PAE file', value: specificJob.pae_file },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})

export const createMultiJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD MultiMD',

  getJobSpecificProperties: (): MongoDBProperty[] => {
    return []
  }
})

export const createOpenFoldJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD OpenFold3',

  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ): MongoDBProperty[] => {
    const specificJob = job.mongo as BilboMDOpenFoldDTO

    return [
      { label: 'Query JSON file', value: specificJob.query_json_file },
      { label: 'PDB file', value: specificJob.pdb_file },
      { label: 'PSF file', value: specificJob.psf_file },
      { label: 'CRD file', value: specificJob.crd_file },
      { label: 'PAE file', value: specificJob.pae_file },
      ...(job.mongo.md_engine === 'CHARMM'
        ? [
            {
              label: 'MD constraint file',
              render: () =>
                React.createElement(ConstraintFileChip, {
                  job: specificJob,
                  onOpenModal
                })
            }
          ]
        : []),
      { label: 'Number of MD Runs', value: getMdRunCount(job) },
      { label: 'Rg values', value: getRgValues(job) },
      { label: 'Number of conformations', value: getConformationCount(job) }
    ]
  }
})
