import rateLimit, { Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

const externalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP or token to 100 requests per window
  message: {
    message: 'Too many requests from this IP or token, please try again later.'
  },
  handler: (req: Request, res: Response, next: NextFunction, options: Options) => {
    const clientIp = (req.ip ?? '').includes('::ffff:')
      ? (req.ip ?? '').split('::ffff:')[1]
      : req.ip ?? ''
    logger.warn(
      `Rate limit hit: ${options.message.message}\t${req.method}\t${req.url}\t${clientIp}`,
      'rateLimit.log'
    )
    res.status(options.statusCode).send(options.message)
  },
  standardHeaders: true,
  legacyHeaders: false
})

export { externalApiLimiter }
