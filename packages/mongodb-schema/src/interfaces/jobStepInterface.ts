export const StepStatus = {
  Waiting: 'Waiting',
  Running: 'Running',
  Success: 'Success',
  Error: 'Error'
} as const

interface IStepStatus {
  status: StepStatusEnum
  message: string
}

// Interface for steps status
interface IBilboMDSteps {
  alphafold?: IStepStatus
  reduce?: IStepStatus
  rnaview?: IStepStatus
  pdb2crd?: IStepStatus
  pae?: IStepStatus
  autorg?: IStepStatus
  minimize?: IStepStatus
  initfoxs?: IStepStatus
  heat?: IStepStatus
  md?: IStepStatus
  kgs?: IStepStatus
  dcd2pdb?: IStepStatus
  pdb_remediate?: IStepStatus
  movies?: IStepStatus
  foxs?: IStepStatus
  pepsisans?: IStepStatus
  ionnet?: IStepStatus
  multifoxs?: IStepStatus
  scoper?: IStepStatus
  gasans?: IStepStatus
  copy_results_to_cfs?: IStepStatus
  results?: IStepStatus
  email?: IStepStatus
  nersc_prepare_slurm_batch?: IStepStatus
  nersc_submit_slurm_batch?: IStepStatus
  nersc_job_status?: IStepStatus
  nersc_copy_results_to_cfs?: IStepStatus
}

export type StepStatusEnum = (typeof StepStatus)[keyof typeof StepStatus]

export { IBilboMDSteps, IStepStatus }
