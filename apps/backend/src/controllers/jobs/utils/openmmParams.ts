import { IOpenMMParameters } from '@bilbomd/mongodb-schema'
import { Request } from 'express'

const buildOpenMMParameters = (reqBody: Request['body']): IOpenMMParameters => {
  // Start with defaults, override with any provided values
  return {
    minimize: {
      max_iterations: parseInt(reqBody.omm_minimize_max_iter) || 1000
    },
    heating: {
      start_temp: parseInt(reqBody.omm_heat_start_temp) || 300,
      final_temp: parseInt(reqBody.omm_heat_final_temp) || 600,
      nsteps: parseInt(reqBody.omm_heat_nsteps) || 10000,
      timestep: parseFloat(reqBody.omm_heat_timestep) || 0.001
    },
    md: {
      temperature: parseInt(reqBody.omm_md_temp) || 600,
      friction: parseFloat(reqBody.omm_md_friction) || 0.1,
      nsteps: parseInt(reqBody.omm_md_nsteps) || 300000,
      timestep: parseFloat(reqBody.omm_md_timestep) || 0.001,
      k_rg: parseInt(reqBody.omm_md_k_rg) || 10,
      rg_report_interval: parseInt(reqBody.omm_md_rg_report_interval) || 500,
      pdb_report_interval: parseInt(reqBody.omm_md_pdb_report_interval) || 500
    }
  }
}

export { buildOpenMMParameters }
