import { logger } from '../middleware/loggers.js'
import jwt from 'jsonwebtoken'
import { User, IUser } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'
import { issueTokensAndSetCookie } from './auth/authTokens.js'

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET ?? ''

interface BilboMDJwtPayload {
  username: string
  roles: string[]
  email: string
}

const otp = async (req: Request, res: Response) => {
  try {
    const { otp: code } = req.body
    logger.info(`Received OTP: ${code}`)

    if (!code) {
      res.status(400).json({ message: 'OTP required.' })
      return
    }

    const user: IUser | null = await User.findOne({ 'otp.code': code })

    if (user) {
      if (!user.active) {
        logger.warn('User is not active')
        res.status(401).json({ message: 'Unauthorized - User is not active`' })
        return
      }
      logger.debug(`User found: ${user.username}`)
      // logger.info({ level: 'info', message: 'hello' })
      logger.info(`OTP login for user: ${user.username} email: ${user.email}`)

      // Check if OTP has expired
      const currentTimestamp = Date.now()
      if (user.otp?.expiresAt && user.otp.expiresAt.getTime() < currentTimestamp) {
        logger.warn('OTP has expired')
        res.status(401).json({ error: 'OTP has expired' })
      }

      const accessToken = await issueTokensAndSetCookie(user, res)

      user.otp = null
      await user.save()

      res.json({ accessToken })
    } else {
      logger.warn('Invalid OTP')
      res.status(401).json({ message: 'Invalid OTP' })
    }
  } catch (error) {
    logger.error(`Error occurred while querying user: ${error}`)
    res.status(500).json({ message: 'Internal server error' })
  }
}

const refresh = async (req: Request, res: Response) => {
  const cookies = req.cookies

  if (!cookies?.jwt) {
    res.status(401).json({ message: 'Unauthorized - no token' })
    return
  }

  const refreshToken = cookies.jwt

  try {
    const decoded = jwt.verify(refreshToken, refreshTokenSecret, {
      algorithms: ['HS256']
    }) as BilboMDJwtPayload

    const foundUser = await User.findOne({ email: decoded.email }).exec()
    if (!foundUser || !foundUser.active) {
      res.status(401).json({ message: 'Unauthorized' })
      return
    }

    const accessToken = await issueTokensAndSetCookie(foundUser, res)
    res.json({ accessToken })
  } catch (error) {
    logger.error(`Error occurred while verifying token: ${error}`)
    res.status(403).json({ message: 'Forbidden' })
  }
}

const logout = (req: Request, res: Response) => {
  const cookies = req.cookies
  if (!cookies?.jwt) res.sendStatus(204) //No content
  res.clearCookie('jwt', { httpOnly: true, sameSite: 'none', secure: true }) // May need to adjust to match cookie settings from above
  res.json({ message: 'Cookie cleared' })
}

export { otp, refresh, logout }
