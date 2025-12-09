import { IOpenMMParameters } from '@bilbomd/mongodb-schema'
import { Request } from 'express'
import { calculateRgyrRange } from './calculateRgyrRange.js'

const buildOpenMMParameters = (reqBody: Request['body']): IOpenMMParameters => {
  const {
    omm_minimize_max_iter,
    omm_heat_start_temp,
    omm_heat_final_temp,
    omm_heat_nsteps,
    omm_heat_timestep,
    omm_md_temp,
    omm_md_friction,
    omm_md_nsteps,
    omm_md_timestep,
    omm_md_rgyr_min,
    omm_md_rgyr_max,
    omm_md_k_rg,
    omm_md_rg_report_interval,
    omm_md_pdb_report_interval
  } = reqBody
  // Start with defaults, override with any provided values
  return {
    minimize: {
      max_iterations: parseInt(omm_minimize_max_iter) || 1000
    },
    heating: {
      start_temp: parseInt(omm_heat_start_temp) || 300,
      final_temp: parseInt(omm_heat_final_temp) || 600,
      nsteps: parseInt(omm_heat_nsteps) || 10000,
      timestep: parseFloat(omm_heat_timestep) || 0.001
    },
    md: {
      temperature: parseInt(omm_md_temp) || 600,
      friction: parseFloat(omm_md_friction) || 0.1,
      nsteps: parseInt(omm_md_nsteps) || 300000,
      timestep: parseFloat(omm_md_timestep) || 0.001,
      rgyr: calculateRgyrRange(
        parseInt(omm_md_rgyr_min),
        parseInt(omm_md_rgyr_max)
      ),
      k_rg: parseInt(omm_md_k_rg) || 10,
      rg_report_interval: parseInt(omm_md_rg_report_interval) || 500,
      pdb_report_interval: parseInt(omm_md_pdb_report_interval) || 500
    }
  }
}

export { buildOpenMMParameters }
