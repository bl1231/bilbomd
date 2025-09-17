import { Request, Response, NextFunction } from 'express'
import { logger } from './loggers.js'

export const logApiRequest = (req: Request, res: Response, next: NextFunction) => {
  const source = req.apiUser?.email || req.email || 'unknown'
  const method = req.method
  const path = req.originalUrl
  const ip = req.ip

  logger.info(`[API] ${method} ${path} from ${source} (IP: ${ip})`)
  next()
}
