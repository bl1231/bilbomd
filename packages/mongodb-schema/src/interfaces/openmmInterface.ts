interface IOpenMMParameters {
  minimize?: {
    max_iterations?: number
  }
  heating?: {
    start_temp?: number
    final_temp?: number
    nsteps?: number
    timestep?: number
  }
  md?: {
    temperature?: number
    friction?: number
    nsteps?: number
    timestep?: number
    k_rg?: number
    rg_report_interval?: number
    pdb_report_interval?: number
  }
}

export { IOpenMMParameters }
