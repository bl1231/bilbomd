import { ICHARMMParameters } from '@bilbomd/mongodb-schema'
import { Request } from 'express'
import { calculateRgyrRange } from './calculateRgyrRange.js'

const buildCHARMMParameters = (reqBody: Request['body']): ICHARMMParameters => {
  const { charmm_md_nsteps, charmm_md_pdb_report_interval, rg_min, rg_max } =
    reqBody
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
