export const STEP_STATUSES = ['Waiting', 'Running', 'Success', 'Error'] as const

export type StepStatusEnum = (typeof STEP_STATUSES)[number]

interface StepStatus {
  status: StepStatusEnum
  message: string
}

// Interface for steps status
export interface JobStepsDTO {
  alphafold?: StepStatus
  pdb2crd?: StepStatus
  pae?: StepStatus
  autorg?: StepStatus
  minimize?: StepStatus
  initfoxs?: StepStatus
  heat?: StepStatus
  md?: StepStatus
  dcd2pdb?: StepStatus
  pdb_remediate?: StepStatus
  movies?: StepStatus
  foxs?: StepStatus
  pepsisans?: StepStatus
  multifoxs?: StepStatus
  gasans?: StepStatus
  copy_results_to_cfs?: StepStatus
  results?: StepStatus
  email?: StepStatus
  nersc_prepare_slurm_batch?: StepStatus
  nersc_submit_slurm_batch?: StepStatus
  nersc_job_status?: StepStatus
  nersc_copy_results_to_cfs?: StepStatus
}
