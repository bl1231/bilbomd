import { Request, Response, NextFunction } from 'express'
import { Session, SessionData } from 'express-session'
import { logger } from './loggers.js'

// Extend the Session interface to include our custom properties
declare module 'express-session' {
  interface SessionData {
    userId?: string
    userRole?: string
  }
}

// Extend Request interface to include session and userId
interface SessionRequest extends Request {
  session: Session & Partial<SessionData>
  userId?: string
  userRole?: string
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
  try {
    // If user is authenticated via JWT, store their info in session
    if (req.userId) {
      req.session.userId = req.userId
      if (req.userRole) {
        req.session.userRole = req.userRole
      }

      logger.debug(`Video session set for user: ${req.userId}`)
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
    if (!req.session || !req.session.userId) {
      logger.warn('Video access attempt without valid session')
      return res.status(401).json({
        message: 'Video session expired. Please refresh the page.'
      })
    }

    // Attach userId to request for the streaming handler
    req.userId = req.session.userId
    req.userRole = req.session.userRole

    logger.debug(`Video session verified for user: ${req.userId}`)
    next()
  } catch (error) {
    logger.error('Error verifying video session:', error)
    res.status(500).json({ message: 'Session verification failed' })
  }
}

export { setVideoSession, verifyVideoSession }
