import { Request, Response, NextFunction } from 'express'

const logPublicJobIPs = (req: Request, res: Response, next: NextFunction) => {
  logger.info(
    `Public job request - Client IP: ${req.ip}, X-Forwarded-For: ${req.headers['x-forwarded-for']}, IPs: ${req.ips?.join(', ')}`
  )
  next()
}

export default logPublicJobIPs
