import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'
import { clientIp } from './clientIp.js'

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// Per-window request limits for the external API
export const EXTERNAL_IP_MAX = 300
export const EXTERNAL_SUBMIT_MAX = 20
export const EXTERNAL_READ_MAX = 300

const ipKey = (req: Request) => ipKeyGenerator(clientIp(req))

// Set by verifyAPIToken. The IP fallback only applies if a token limiter is
// ever mounted ahead of it.
const tokenKey = (req: Request) =>
  req.apiTokenHash ? `token:${req.apiTokenHash}` : ipKey(req)

const createExternalLimiter = (
  max: number,
  keyGenerator: (req: Request) => string,
  message: string
) =>
  rateLimit({
    windowMs: WINDOW_MS,
    max,
    keyGenerator,
    message: { message },
    handler: (
      req: Request,
      res: Response,
      _next: NextFunction,
      options: Options
    ) => {
      const who = req.apiUser?.email ?? clientIp(req)
      logger.warn(
        `Rate limit hit: ${options.message.message}\t${req.method}\t${req.url}\t${who}`,
        'rateLimit.log'
      )
      res.status(options.statusCode).send(options.message)
    },
    standardHeaders: true,
    legacyHeaders: false
  })

// Per IP, in front of the token check, so requests without a valid token are
// capped too. Loose enough that several API users behind one address (a lab
// NAT, a NERSC login node) don't reach it with normal use.
const externalApiLimiter = createExternalLimiter(
  EXTERNAL_IP_MAX,
  ipKey,
  'Too many requests from this IP, please try again later.'
)

// Per API token. Every submission starts GPU work.
const externalSubmitLimiter = createExternalLimiter(
  EXTERNAL_SUBMIT_MAX,
  tokenKey,
  `Too many job submissions for this API token (at most ${EXTERNAL_SUBMIT_MAX} per 15 minutes), please try again later.`
)

// Per API token: status checks and result downloads
const externalReadLimiter = createExternalLimiter(
  EXTERNAL_READ_MAX,
  tokenKey,
  `Too many requests for this API token (at most ${EXTERNAL_READ_MAX} per 15 minutes). Poll job status every 30-60 seconds.`
)

export { externalApiLimiter, externalSubmitLimiter, externalReadLimiter }
