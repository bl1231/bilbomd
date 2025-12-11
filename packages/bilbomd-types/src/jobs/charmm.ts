export interface CHARMMMinimizeParamsDTO {}

export interface CHARMMHeatingParamsDTO {}

export interface CHARMMMDParamsDTO {
  nsteps: number
  rgyr: number[]
  pdb_report_interval: number
}

export interface CHARMMParametersDTO {
  minimize?: CHARMMMinimizeParamsDTO
  heating?: CHARMMHeatingParamsDTO
  md?: CHARMMMDParamsDTO
}
