import { ICHARMMParameters } from '@bilbomd/mongodb-schema'

import { calculateRgyrRange } from './calculateRgyrRange.js'

const buildCHARMMParameters = (
  rg_min: number,
  rg_max: number
): ICHARMMParameters => {
  return {
    minimize: {},
    heating: {},
    md: {
      rgyr: calculateRgyrRange(rg_min || 20, rg_max || 50)
    }
  }
}

export { buildCHARMMParameters }
