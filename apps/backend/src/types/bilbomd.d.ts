import { Job as BullMQJob } from 'bullmq'
import { Job as MongoDBJob } from '@bl1231/bilbomd-mongodb-schema'

export type BilboMDSteps = {
  pae?: string
  autorg?: string
  minimize: string
  heat: string
  md: string
  foxs: string
  multifoxs: string
  results: string
  email: string
  numEnsembles: number
}

export type BilboMDAlphaFoldResults = {
  numEnsembles: number
}

export type BilboMDScoperSteps = {
  reduce: string
  rnaview: string
  kgs: string
  kgsConformations: number
  kgsFiles: number
  foxs: string
  foxsProgress: number
  foxsTopFile: string
  foxsTopScore: number
  createdFeatures: boolean
  IonNet: string
  predictionThreshold: number
  multifoxs: string
  multifoxsEnsembleSize: number
  multifoxsScore: number
  scoperPdb: string
  scoper: string
  results: string
  email: string
}

export type BullMQData = {
  type: string
  title: string
  uuid: string
  jobid: string
}

export type BullMQPdb2Crd = {
  type: string
  title: string
  uuid: string
  pdb_file: string
  pae_power: string
  plddt_cutoff: string
}

export type BilboMDBullMQ = {
  position: number | string
  queuePosition: string
  bilbomdStep: BilboMDSteps | BilboMDScoperSteps
  bilbomdLastStep: string
  bullmq: BullMQJob
}

export type BilboMDJob = {
  id: string
  username?: string
  mongo: MongoDBJob
  bullmq?: BilboMDBullMQ
  scoper?: BilboMDScoperSteps
  classic?: BilboMDSteps
  auto?: BilboMDSteps
  alphafold?: BilboMDAlphaFoldResults
}

export type AutoRgResults = {
  rg: number
  rg_min: number
  rg_max: number
}
