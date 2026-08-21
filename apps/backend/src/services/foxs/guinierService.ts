import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../middleware/loggers.js'
import { GuinierFit } from '@bilbomd/bilbomd-types'
import { AutoRgResults } from '../../types/bilbomd.js'
import { spawnAutoRgCalculator } from '../../controllers/jobs/utils/autoRg.js'

// Cached AutoRg output, written into the job directory on first request so
// completed jobs (including old ones) only ever pay the cost once.
const GUINIER_CACHE_FILENAME = 'autorg.json'

const toGuinierFit = (results: AutoRgResults): GuinierFit | undefined => {
  // Caches written before autorg.py emitted i0 lack the fields needed for
  // Kratky normalization — treat them as a miss so they get recomputed.
  if (results?.i0 == null) return undefined
  return {
    rg: results.rg_exact ?? results.rg,
    i0: results.i0,
    qmin: results.qmin,
    qmax: results.qmax,
    ...(results.r2 != null ? { r2: results.r2 } : {})
  }
}

/**
 * Return the Guinier fit (Rg, I0, fit window) for a job's experimental SAXS
 * profile, computing it via autorg.py and caching the result in the job
 * directory. Returns undefined (never throws) when the fit is unavailable —
 * callers should degrade gracefully.
 */
const getGuinierFit = async (
  jobDir: string,
  dataFileName: string
): Promise<GuinierFit | undefined> => {
  const cacheFile = path.join(jobDir, GUINIER_CACHE_FILENAME)
  try {
    if (await fs.pathExists(cacheFile)) {
      const cached = (await fs.readJson(cacheFile)) as AutoRgResults
      const fit = toGuinierFit(cached)
      if (fit) return fit
      logger.info(
        `Stale Guinier cache (missing i0) in ${jobDir} — recomputing`
      )
    }

    const expDatFile = path.join(jobDir, dataFileName)
    if (!(await fs.pathExists(expDatFile))) {
      logger.warn(`Experimental .dat file not found for Guinier fit: ${expDatFile}`)
      return undefined
    }

    const results = await spawnAutoRgCalculator(jobDir, dataFileName)
    await fs.writeJson(cacheFile, results)
    return toGuinierFit(results)
  } catch (error) {
    logger.warn(`Guinier fit unavailable for ${jobDir}: ${error}`)
    return undefined
  }
}

export { getGuinierFit, toGuinierFit, GUINIER_CACHE_FILENAME }
