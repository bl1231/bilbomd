import rateLimit from 'express-rate-limit'
import { logger } from './loggers.js'

const publicJobLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 anon submissions per 10 minutes per IP
  message: {
    message:
      'Too many anonymous job submissions from this IP. Please wait a few minutes and try again.'
  },
  handler: (req, res, next, options) => {
    const clientIp = (req.ip ?? '').includes('::ffff:')
      ? (req.ip ?? '').split('::ffff:')[1]
      : (req.ip ?? '')
    logger.error(
      `Too Many Public Job Requests: ${options.message.message}\t${req.method}\t${req.url}\t${req.headers.origin}\t${clientIp}`,
      'errLog.log'
    )
    res.status(options.statusCode).send(options.message)
  },
  standardHeaders: true,
  legacyHeaders: false
})

export { publicJobLimiter }
