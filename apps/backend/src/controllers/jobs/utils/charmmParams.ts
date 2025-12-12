import { ICHARMMParameters } from '@bilbomd/mongodb-schema'
import { Request } from 'express'
import { calculateRgyrRange } from './calculateRgyrRange.js'

const buildCHARMMParameters = (reqBody: Request['body']): ICHARMMParameters => {
  let { charmm_md_nsteps } = reqBody
  const { charmm_md_pdb_report_interval, rg_min, rg_max } = reqBody
  if (!charmm_md_nsteps) {
    // Default to 100,000 steps per conformation is because teh template file for CHARMM
    // uses a hardcoded value of 100,000 steps for the MD run.
    charmm_md_nsteps = reqBody.num_conf * 100000
  }

  return {
    minimize: {},
    heating: {},
    md: {
      nsteps: parseInt(charmm_md_nsteps) || 300000,
      pdb_report_interval: parseInt(charmm_md_pdb_report_interval) || 500,
      rgyr: calculateRgyrRange(parseInt(rg_min), parseInt(rg_max))
    }
  }
}

export { buildCHARMMParameters }
