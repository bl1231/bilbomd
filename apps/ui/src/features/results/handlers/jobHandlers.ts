import React from 'react'
import type { JobView } from 'features/jobdetail/jobView'
import type { JobHandler, MongoDBProperty } from '../types'
import { ConstraintFileChip } from '../components/ConstraintFileChip'

const mdParameters = (view: JobView) =>
  (view.md_engine ?? 'CHARMM') === 'CHARMM'
    ? view.inputs.charmm_parameters?.md
    : view.inputs.openmm_parameters?.md

const getMdRunCount = (view: JobView): number =>
  mdParameters(view)?.rgyr?.length ?? 0

const getRgValues = (view: JobView): string | undefined => {
  const rgyr = mdParameters(view)?.rgyr
  if (!rgyr || rgyr.length === 0) return undefined
  return rgyr.map((value) => `${value} Å`).join(', ')
}

const getConformationCount = (view: JobView): number => {
  const md = mdParameters(view)
  const nsteps = md?.nsteps
  const rgyrLength = md?.rgyr?.length
  const reportInterval = md?.pdb_report_interval
  if (!nsteps || !rgyrLength || !reportInterval || reportInterval <= 0) {
    return 0
  }
  return (nsteps * rgyrLength) / reportInterval
}

const mdRunProperties = (view: JobView): MongoDBProperty[] => [
  { label: 'Number of MD Runs', value: getMdRunCount(view) },
  { label: 'Rg values', value: getRgValues(view) },
  { label: 'Number of conformations', value: getConformationCount(view) }
]

// Only CHARMM jobs have a constraint file. Owners can open it; the public
// page has no file endpoint, so it just shows the name.
const constraintFileProperties = (
  view: JobView,
  onOpenModal?: () => void
): MongoDBProperty[] => {
  if (view.md_engine !== 'CHARMM') return []
  if (!onOpenModal) {
    return [{ label: 'MD constraint file', value: view.inputs.const_inp_file }]
  }
  return [
    {
      label: 'MD constraint file',
      render: () =>
        React.createElement(ConstraintFileChip, {
          job: view.inputs,
          onOpenModal
        })
    }
  ]
}

const structureFileProperties = (view: JobView): MongoDBProperty[] => [
  { label: 'PDB file', value: view.inputs.pdb_file },
  { label: 'PSF file', value: view.inputs.psf_file },
  { label: 'CRD file', value: view.inputs.crd_file }
]

const classicHandler = (displayName: string): JobHandler => ({
  getJobTypeDisplayName: () => displayName,
  getJobSpecificProperties: (view, onOpenModal) => [
    ...structureFileProperties(view),
    ...constraintFileProperties(view, onOpenModal),
    ...mdRunProperties(view)
  ]
})

export const createAutoJobHandler = (): JobHandler =>
  classicHandler('BilboMD Auto')

export const createPdbJobHandler = (): JobHandler =>
  classicHandler('BilboMD Classic w/PDB')

export const createCrdJobHandler = (): JobHandler =>
  classicHandler('BilboMD Classic w/CRD/PSF')

export const createSansJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD SANS',
  getJobSpecificProperties: (view, onOpenModal) => [
    { label: 'PDB file', value: view.inputs.pdb_file },
    {
      label: 'Solvent D20 Fraction',
      value: view.inputs.d2o_fraction,
      suffix: '%'
    },
    ...constraintFileProperties(view, onOpenModal),
    { label: 'Rg min', value: view.inputs.rg_min, suffix: 'Å' },
    { label: 'Rg max', value: view.inputs.rg_max, suffix: 'Å' },
    ...mdRunProperties(view)
  ]
})

export const createScoperJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD Scoper',
  getJobSpecificProperties: (view) => [
    { label: 'PDB file', value: view.inputs.pdb_file }
  ]
})

export const createAlphaFoldJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD AlphaFold',
  getJobSpecificProperties: (view, onOpenModal) => [
    { label: 'FASTA file', value: view.inputs.fasta_file },
    ...structureFileProperties(view),
    { label: 'PAE file', value: view.inputs.pae_file },
    ...constraintFileProperties(view, onOpenModal),
    ...mdRunProperties(view)
  ]
})

export const createOpenFoldJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD OpenFold3',
  getJobSpecificProperties: (view, onOpenModal) => [
    { label: 'Query JSON file', value: view.inputs.query_json_file },
    ...structureFileProperties(view),
    { label: 'PAE file', value: view.inputs.pae_file },
    ...constraintFileProperties(view, onOpenModal),
    ...mdRunProperties(view)
  ]
})

// The combined job UUIDs are rendered by the inputs section itself
export const createMultiJobHandler = (): JobHandler => ({
  getJobTypeDisplayName: () => 'BilboMD MultiMD',
  getJobSpecificProperties: () => []
})
