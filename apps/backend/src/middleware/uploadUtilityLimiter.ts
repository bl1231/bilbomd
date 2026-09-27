import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'
import { clientIp } from './clientIp.js'

interface UploadUtilityLimiterOptions {
  name: string
  max?: number
  windowMs?: number
}

// Rate limiter for the unauthenticated upload utilities (/autorg, /af2pae).
// Each call gets its own in-memory store, so the endpoints are limited
// independently. Keyed per client (see clientIp).
export const createUploadUtilityLimiter = ({
  name,
  max = 20,
  windowMs = 10 * 60 * 1000
}: UploadUtilityLimiterOptions) =>
  rateLimit({
    windowMs,
    limit: max,
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
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
        `Rate limit hit: ${options.message.message}\t${req.method}\t${req.originalUrl}\t${clientIp(req)}`
      )
      res.status(options.statusCode).send(options.message)
    },
    standardHeaders: true,
    legacyHeaders: false
  })

export const autoRgLimiter = createUploadUtilityLimiter({ name: 'AutoRg' })

export const af2paeLimiter = createUploadUtilityLimiter({ name: 'PAE Jiffy' })
