import { Schema, model } from 'mongoose'
import { IBilboMDSteps } from '../interfaces'

// Enum for step statuses
const stepStatusEnum = ['Waiting', 'Running', 'Success', 'Error']

// Schema for step status
const stepStatusSchema = new Schema({
  status: { type: String, enum: stepStatusEnum, default: 'Waiting' },
  message: { type: String, required: false }
})

const stepsSchema = new Schema<IBilboMDSteps>({
  alphafold: { type: stepStatusSchema, required: false },
  reduce: { type: stepStatusSchema, required: false },
  rnaview: { type: stepStatusSchema, required: false },
  pdb2crd: { type: stepStatusSchema, required: false },
  pae: { type: stepStatusSchema, required: false },
  autorg: { type: stepStatusSchema, required: false },
  minimize: { type: stepStatusSchema, required: false },
  initfoxs: { type: stepStatusSchema, required: false },
  heat: { type: stepStatusSchema, required: false },
  md: { type: stepStatusSchema, required: false },
  kgs: { type: stepStatusSchema, required: false },
  dcd2pdb: { type: stepStatusSchema, required: false },
  pdb_remediate: { type: stepStatusSchema, required: false },
  movies: { type: stepStatusSchema, required: false },
  foxs: { type: stepStatusSchema, required: false },
  pepsisans: { type: stepStatusSchema, required: false },
  ionnet: { type: stepStatusSchema, required: false },
  multifoxs: { type: stepStatusSchema, required: false },
  scoper: { type: stepStatusSchema, required: false },
  gasans: { type: stepStatusSchema, required: false },
  copy_results_to_cfs: { type: stepStatusSchema, required: false },
  results: { type: stepStatusSchema, required: false },
  email: { type: stepStatusSchema, required: false },
  nersc_prepare_slurm_batch: { type: stepStatusSchema, required: false },
  nersc_submit_slurm_batch: { type: stepStatusSchema, required: false },
  nersc_job_status: { type: stepStatusSchema, required: false },
  nersc_copy_results_to_cfs: { type: stepStatusSchema, required: false }
})

export { stepsSchema }
