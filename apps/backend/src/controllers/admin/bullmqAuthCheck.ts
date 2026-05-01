import jwt from 'jsonwebtoken'
import { Request, Response } from 'express'
import { getEnvVar } from '../../config/config.js'

interface BilboMDJwtPayload {
  username: string
  roles: string[]
  email: string
}

const refreshTokenSecret = getEnvVar('REFRESH_TOKEN_SECRET')

const bullmqAuthCheck = (req: Request, res: Response) => {
  const cookies = req.cookies
  if (!cookies?.jwt) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  try {
    const decoded = jwt.verify(cookies.jwt, refreshTokenSecret, {
      algorithms: ['HS256']
    }) as BilboMDJwtPayload
    if (!decoded.roles?.includes('Admin')) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    res.status(200).json({ message: 'OK' })
  } catch {
    res.status(401).json({ message: 'Unauthorized' })
  }
}

export { bullmqAuthCheck }
