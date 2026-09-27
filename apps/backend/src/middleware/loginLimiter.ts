import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'
import { clientIp } from './clientIp.js'

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Limit each IP to 3 login requests per `window` per minute
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: {
    message:
      'Too many login attempts from this IP, please try again after a 60 second pause'
  },
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
    options: Options
  ) => {
    const ip = clientIp(req)
    logger.error(
      `Too Many Requests: ${options.message.message}\t${req.method}\t${req.url}\t${req.headers.origin}\t${ip}`,
      {
        clientIp: ip,
        method: req.method,
        url: req.url,
        origin: req.headers.origin
      }
    )
    res.status(options.statusCode).send(options.message)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
})

export { loginLimiter }
