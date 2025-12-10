import React from 'react'
import type {
  BilboMDJobDTO,
  BilboMDAutoDTO,
  BilboMDSANSDTO,
  BilboMDPDBDTO,
  BilboMDCRDDTO,
  BilboMDScoperDTO
} from '@bilbomd/bilbomd-types'
import type { JobHandler, MongoDBProperty } from '../types'
import { ConstraintFileChip } from '../components/ConstraintFileChip'

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
      {
        label: 'MD constraint file',
        render: () =>
          React.createElement(ConstraintFileChip, {
            job: specificJob,
            onOpenModal
          })
      },
      {
        label: 'Number of MD Runs',
        value: specificJob.openmm_parameters?.md?.rgyr?.length || 0
      },
      { label: 'Number of conformations', value: 600 }
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
      {
        label: 'MD constraint file',
        render: () =>
          React.createElement(ConstraintFileChip, {
            job: specificJob,
            onOpenModal
          })
      },
      { label: 'Rg min', value: specificJob.rg_min, suffix: 'Å' },
      { label: 'Rg max', value: specificJob.rg_max, suffix: 'Å' }
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
      {
        label: 'MD constraint file',
        render: () =>
          React.createElement(ConstraintFileChip, {
            job: specificJob,
            onOpenModal
          })
      },
      {
        label: 'Number of MD Runs',
        value: specificJob.openmm_parameters?.md?.rgyr?.length || 0
      },
      { label: 'Number of conformations', value: 600 }
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
      {
        label: 'MD constraint file',
        render: () =>
          React.createElement(ConstraintFileChip, {
            job: specificJob,
            onOpenModal
          })
      },
      {
        label: 'Number of MD Runs',
        value: specificJob.openmm_parameters?.md?.rgyr?.length || 0
      },
      { label: 'Number of conformations', value: 600 }
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

  getJobSpecificProperties: (): MongoDBProperty[] => {
    // AlphaFold jobs might have specific properties in the future
    return []
  }
})

export const createMultiJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD MultiMD',

  getJobSpecificProperties: (): MongoDBProperty[] => {
    // Multi jobs might have specific properties in the future
    return []
  }
})
