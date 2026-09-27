import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { logger } from './loggers.js'
import { clientIp } from './clientIp.js'

const publicJobLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 anon submissions per 10 minutes per IP
  // ipKeyGenerator groups IPv6 addresses by subnet so a client can't rotate
  // through its own addresses
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: {
    message:
      'Too many anonymous job submissions from this IP. Please wait a few minutes and try again.'
  },
  handler: (req, res, next, options) => {
    const cleanIp = clientIp(req)
    logger.error(
      `Too Many Public Job Requests: ${options.message.message}\t${req.method}\t${req.url}\t${req.headers.origin}\t${cleanIp}`,
      'errLog.log'
    )
    res.status(options.statusCode).send(options.message)
  },
  standardHeaders: true,
  legacyHeaders: false
})

export { publicJobLimiter }
