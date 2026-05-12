import { logger } from '../../middleware/loggers.js'
import jwt from 'jsonwebtoken'
import { User, IUser } from '@bilbomd/mongodb-schema'
import { Request, Response } from 'express'
import { issueTokensAndSetCookie } from './authTokens.js'
import { getEnvVar } from '../../config/config.js'

const refreshTokenSecret = getEnvVar('REFRESH_TOKEN_SECRET')

interface BilboMDJwtPayload {
  username: string
  roles: string[]
  email: string
}

const MAX_OTP_ATTEMPTS = 5

const otp = async (req: Request, res: Response) => {
  try {
    const code = String(req.body.otp ?? '')

    if (!code) {
      res.status(400).json({ message: 'OTP required.' })
      return
    }

    const user: IUser | null = await User.findOne({ 'otp.code': code })

    if (!user) {
      logger.warn('Invalid OTP')
      res.status(401).json({ message: 'Invalid OTP' })
      return
    }

    if (!user.active) {
      logger.warn('User is not active')
      res.status(401).json({ message: 'Unauthorized - User is not active' })
      return
    }

    logger.debug(`User found: ${user.username}`)

    const currentAttempts = user.otp?.attempts ?? 0

    if (currentAttempts >= MAX_OTP_ATTEMPTS) {
      logger.warn(`OTP attempt limit reached for user: ${user.username}`)
      user.otp = null
      await user.save()
      res
        .status(429)
        .json({ message: 'Too many OTP attempts. Please request a new magic link.' })
      return
    }

    if (user.otp?.expiresAt && user.otp.expiresAt.getTime() < Date.now()) {
      logger.warn('OTP has expired')
      const newAttempts = currentAttempts + 1
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        user.otp = null
        await user.save()
        res
          .status(429)
          .json({ message: 'Too many OTP attempts. Please request a new magic link.' })
      } else {
        user.otp.attempts = newAttempts
        await user.save()
        res.status(401).json({ error: 'OTP has expired' })
      }
      return
    }

    logger.info(`OTP login for user: ${user.username} email: ${user.email}`)
    const accessToken = await issueTokensAndSetCookie(user, res)
    user.otp = null
    await user.save()
    res.json({ accessToken })
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
  if (!cookies?.jwt) {
    res.sendStatus(204)
    return
  }

  const isProduction = process.env.BILBOMD_ENV === 'production'
  res.clearCookie('jwt', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  })
  res.json({ message: 'Cookie cleared' })
}

export { otp, refresh, logout }
