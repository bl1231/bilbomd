import { ICHARMMParameters } from '@bilbomd/mongodb-schema'
import { Request } from 'express'
import { calculateRgyrRange } from './calculateRgyrRange.js'

const buildCHARMMParameters = (reqBody: Request['body']): ICHARMMParameters => {
  const { charmm_md_nsteps, rg_min, rg_max } = reqBody
  return {
    minimize: {},
    heating: {},
    md: {
      nsteps: parseInt(charmm_md_nsteps) || 300000,
      rgyr: calculateRgyrRange(rg_min, rg_max)
    }
  }
}

export { buildCHARMMParameters }
