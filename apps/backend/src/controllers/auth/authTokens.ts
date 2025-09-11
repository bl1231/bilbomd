import jwt from 'jsonwebtoken'
import { Response } from 'express'
import { IUser } from '@bl1231/bilbomd-mongodb-schema'
// import { logger } from '../../middleware/loggers.js'

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET ?? ''
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET ?? ''

export async function issueTokensAndSetCookie(
  user: IUser,
  res: Response
): Promise<string> {
  // logger.info(`Issuing tokens for user: ${user.username}`)
  // logger.info(`User roles : ${user.roles.join(', ')}`)
  const accessToken = jwt.sign(
    {
      UserInfo: {
        username: user.username,
        roles: user.roles,
        email: user.email
      }
    },
    accessTokenSecret,
    { expiresIn: '2m' }
  )

  const refreshToken = jwt.sign(
    {
      username: user.username,
      roles: user.roles,
      email: user.email
    },
    refreshTokenSecret,
    { expiresIn: '7d' }
  )

  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('jwt', refreshToken, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  })

  return accessToken
}
