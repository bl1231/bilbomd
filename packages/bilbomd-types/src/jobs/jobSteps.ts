export const STEP_STATUSES = ['Waiting', 'Running', 'Success', 'Error'] as const

export type StepStatusEnum = (typeof STEP_STATUSES)[number]

export interface StepStatus {
  status: StepStatusEnum
  message: string
  // Stamped server-side when the step starts/finishes; absent on older jobs
  started_at?: Date
  completed_at?: Date
  duration_ms?: number
}

export interface JobStepsDTO {
  alphafold?: StepStatus
  openfold?: StepStatus
  reduce?: StepStatus
  rnaview?: StepStatus
  pdb2crd?: StepStatus
  pae?: StepStatus
  autorg?: StepStatus
  minimize?: StepStatus
  initfoxs?: StepStatus
  heat?: StepStatus
  md?: StepStatus
  kgs?: StepStatus
  dcd2pdb?: StepStatus
  pdb_remediate?: StepStatus
  movies?: StepStatus
  foxs?: StepStatus
  pepsisans?: StepStatus
  ionnet?: StepStatus
  multifoxs?: StepStatus
  scoper?: StepStatus
  gasans?: StepStatus
  copy_results_to_cfs?: StepStatus
  results?: StepStatus
  email?: StepStatus
  nersc_prepare_slurm_batch?: StepStatus
  nersc_submit_slurm_batch?: StepStatus
  nersc_job_status?: StepStatus
  nersc_copy_results_to_cfs?: StepStatus
}
