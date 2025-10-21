import { Request, Response, NextFunction } from 'express'
import { Session, SessionData } from 'express-session'
import { logger } from './loggers.js'

// Extend the Session interface to include our custom properties
declare module 'express-session' {
  interface SessionData {
    username?: string
    roles?: string[]
    email?: string
  }
}

// Extend Request interface to include session and user properties
interface SessionRequest extends Request {
  session: Session & Partial<SessionData>
  user?: string // JWT sets this as username
  roles?: string[]
  email?: string
}

/**
 * Middleware to set video session data from JWT-authenticated requests
 * This runs on regular API routes to populate the session with user info
 */
const setVideoSession = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
) => {
  logger.debug('Setting video session middleware called')
  logger.debug(`req.user exists: ${!!req.user}`)
  logger.debug(`req.user value: ${req.user}`)
  logger.debug(`req.session exists: ${!!req.session}`)

  try {
    // If user is authenticated via JWT, store their info in session
    if (req.user) {
      req.session.username = req.user
      if (req.roles) {
        req.session.roles = req.roles
      }
      if (req.email) {
        req.session.email = req.email
      }

      logger.debug(`Video session set for user: ${req.user}`)
      logger.debug(`Session after setting: ${JSON.stringify(req.session)}`)
    } else {
      logger.warn(
        'No req.user found - JWT middleware may not have run or set user'
      )
    }

    next()
  } catch (error) {
    logger.error('Error setting video session:', error)
    next() // Don't fail the request, just continue without setting session
  }
}

/**
 * Middleware to verify video session for streaming endpoints
 * This runs on video streaming routes instead of JWT verification
 */
const verifyVideoSession = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if user session exists
    if (!req.session || !req.session.username) {
      logger.warn('Video access attempt without valid session')
      return res.status(401).json({
        message: 'Video session expired. Please refresh the page.'
      })
    }

    // Attach user info to request for the streaming handler
    req.user = req.session.username
    req.roles = req.session.roles
    req.email = req.session.email

    logger.debug(`Video session verified for user: ${req.user}`)
    next()
  } catch (error) {
    logger.error('Error verifying video session:', error)
    res.status(500).json({ message: 'Session verification failed' })
  }
}

export { setVideoSession, verifyVideoSession }
