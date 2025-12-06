export interface OpenMMMinimizeParamsDTO {
  max_iterations: number
}

export interface OpenMMHeatingParamsDTO {
  start_temp: number
  final_temp: number
  nsteps: number
  timestep: number
}

export interface OpenMMMDParamsDTO {
  temperature: number
  friction: number
  nsteps: number
  timestep: number
  k_rg: number
  rg_report_interval: number
  pdb_report_interval: number
}

export interface OpenMMParametersDTO {
  minimize?: OpenMMMinimizeParamsDTO
  heating?: OpenMMHeatingParamsDTO
  md?: OpenMMMDParamsDTO
}
