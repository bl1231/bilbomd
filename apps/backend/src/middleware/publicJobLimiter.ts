import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { logger } from './loggers.js'

const publicJobLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 anon submissions per 10 minutes per IP
  keyGenerator: (req) => {
    // Temporarily set req.ip to CF-Connecting-IP for proper IPv6 handling
    const originalIp = req.ip
    req.ip = (req.headers['cf-connecting-ip'] as string) || req.ip || 'unknown'
    const key = ipKeyGenerator(req)
    req.ip = originalIp
    return key
  },
  message: {
    message:
      'Too many anonymous job submissions from this IP. Please wait a few minutes and try again.'
  },
  handler: (req, res, next, options) => {
    const clientIp =
      (req.headers['cf-connecting-ip'] as string) || req.ip || 'unknown'
    const cleanIp = clientIp.includes('::ffff:')
      ? clientIp.split('::ffff:')[1]
      : clientIp
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
