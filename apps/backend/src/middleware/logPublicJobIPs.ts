import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

const logPublicJobIPs = (req: Request, res: Response, next: NextFunction) => {
  logger.info(
    `Public job request - Client IP (req.ip): ${req.ip}, CF-Connecting-IP: ${req.headers['cf-connecting-ip']}, X-Forwarded-For: ${req.headers['x-forwarded-for']}, All IPs (req.ips): ${req.ips?.join(', ')}`
  )
  next()
}

export default logPublicJobIPs
