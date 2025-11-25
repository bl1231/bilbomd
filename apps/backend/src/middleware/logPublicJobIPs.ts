import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

const logPublicJobIPs = (req: Request, res: Response, next: NextFunction) => {
  const deployEnv = process.env.BILBOMD_FQDN
  const nerscSpinRegex = /^bilbomd-nersc(-dev)?\.bl1231\.als\.lbl\.gov$/

  if (deployEnv && nerscSpinRegex.test(deployEnv)) {
    logger.info(
      `NERSC/SPIN Public Job Route - Client IP: ${req.ip}, X-Forwarded-For: ${req.headers['x-forwarded-for']}, X-Real-IP: ${req.headers['x-real-ip']}, All IPs: ${req.ips?.join(', ')}`
    )
  } else {
    logger.info(
      `Public Job Route - Client IP: ${req.ip}, CF-Connecting-IP: ${req.headers['cf-connecting-ip']}, X-Forwarded-For: ${req.headers['x-forwarded-for']}, X-Real-IP: ${req.headers['x-real-ip']}, All IPs: ${req.ips?.join(', ')}`
    )
  }
  next()
}
export default logPublicJobIPs
