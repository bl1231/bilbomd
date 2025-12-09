export interface CHARMMMinimizeParamsDTO {}

export interface CHARMMHeatingParamsDTO {}

export interface CHARMMMDParamsDTO {
  rgyr: number[]
}

export interface CHARMMParametersDTO {
  minimize?: CHARMMMinimizeParamsDTO
  heating?: CHARMMHeatingParamsDTO
  md?: CHARMMMDParamsDTO
}
