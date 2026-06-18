import { Request, Response, NextFunction } from 'express'
import { getLicenseState } from '../license/verifyLicense.js'
import { logger } from './loggers.js'

/**
 * Gate job-creating routes behind a valid BilboMD license. The app stays fully
 * browsable; only job submission is blocked when the license is
 * missing/invalid/expired. See apps/backend/src/license/verifyLicense.ts.
 */
const requireValidLicense = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const license = getLicenseState()

  if (license.status === 'valid') {
    next()
    return
  }

  logger.warn(
    `Blocked job submission to ${req.originalUrl} — license ${license.status}`
  )

  res.status(403).json({
    message:
      'A valid BilboMD license is required to submit jobs. ' +
      'Please contact the BilboMD team to obtain or renew a license.',
    license: {
      status: license.status,
      expiresAt: license.expiresAt
    }
  })
}

export { requireValidLicense }
