import { logger } from '../middleware/loggers.js'
import { Request, Response, NextFunction } from 'express'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import crypto from 'crypto'

// Hashing utility (consistent with your storage approach)
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const verifyAPIToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || (req.headers.Authorization as string)

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Missing or invalid Authorization header' })
      return
    }

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const hashed = hashToken(token)

    const user = await User.findOne({ 'apiTokens.tokenHash': hashed })
    if (!user) {
      res.status(403).json({ message: 'Invalid API token' })
      return
    }

    // Optional: Find the matching token entry (to check for expiry, labels, etc.)
    const tokenEntry = user.apiTokens.find((t) => t.tokenHash === hashed)
    if (!tokenEntry) {
      res.status(403).json({ message: 'Invalid API token' })
      return
    }

    // Optional: Check for expiration
    if (tokenEntry.expiresAt && new Date(tokenEntry.expiresAt) < new Date()) {
      res.status(403).json({ message: 'API token expired' })
      return
    }

    req.apiUser = user
    logger.info(`API token verified for user: ${user.email}`)
    next()
  } catch (err) {
    logger.error('API token verification failed:', err)
    res.status(500).json({ message: 'Internal server error during token verification' })
  }
}
