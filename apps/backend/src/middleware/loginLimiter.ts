import rateLimit, { Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 login requests per `window` per minute
  message: {
    message:
      'Too many login attempts from this IP, please try again after a 60 second pause'
  },
  handler: (req: Request, res: Response, next: NextFunction, options: Options) => {
    const clientIp = (req.ip ?? '').includes('::ffff:')
      ? (req.ip ?? '').split('::ffff:')[1]
      : req.ip ?? ''
    logger.error(
      `Too Many Requests: ${options.message.message}\t${req.method}\t${req.url}\t${req.headers.origin}\t${clientIp}`,
      'errLog.log'
    )
    res.status(options.statusCode).send(options.message)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
})

export { loginLimiter }
