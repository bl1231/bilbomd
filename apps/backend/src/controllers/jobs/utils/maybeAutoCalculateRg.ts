import { spawnAutoRgCalculator } from './autoRg.js'
import { logger } from '../../../middleware/loggers.js'

interface RgValues {
  rg: number
  rg_min: number
  rg_max: number
}

export const maybeAutoCalculateRg = async (
  current: Partial<RgValues>,
  isApiUser: boolean,
  jobDir: string,
  dataFile: string
): Promise<RgValues> => {
  const { rg, rg_min, rg_max } = current

  if ((!rg || !rg_min || !rg_max) && isApiUser) {
    try {
      logger.info('Auto-calculating Rg values for API job...')
      const result = await spawnAutoRgCalculator(jobDir, dataFile)
      logger.info(
        `Auto-calculated RG values: rg=${result.rg}, rg_min=${result.rg_min}, rg_max=${result.rg_max}`
      )
      return result
    } catch (err) {
      logger.error('Failed to calculate RG values from .dat file:', err)
      throw new Error('Failed to auto-calculate RG values')
    }
  }

  return {
    rg: Number(rg),
    rg_min: Number(rg_min),
    rg_max: Number(rg_max)
  }
}
