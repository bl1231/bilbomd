import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

interface UploadUtilityLimiterOptions {
  name: string
  max?: number
  windowMs?: number
}

// Rate limiter for the unauthenticated upload utilities (/autorg, /af2pae).
// Each call gets its own in-memory store, so the endpoints are limited
// independently. Keyed on req.ip, which is the real client address given
// the `trust proxy` setting in app.ts.
export const createUploadUtilityLimiter = ({
  name,
  max = 20,
  windowMs = 10 * 60 * 1000
}: UploadUtilityLimiterOptions) =>
  rateLimit({
    windowMs,
    limit: max,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    message: {
      message: `Too many ${name} requests from this IP. Please wait a few minutes and try again.`
    },
    handler: (
      req: Request,
      res: Response,
      next: NextFunction,
      options: Options
    ) => {
      logger.warn(
        `Rate limit hit: ${options.message.message}\t${req.method}\t${req.originalUrl}\t${req.ip}`
      )
      res.status(options.statusCode).send(options.message)
    },
    standardHeaders: true,
    legacyHeaders: false
  })

export const autoRgLimiter = createUploadUtilityLimiter({ name: 'AutoRg' })

export const af2paeLimiter = createUploadUtilityLimiter({ name: 'PAE Jiffy' })
