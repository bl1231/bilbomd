import jwt from 'jsonwebtoken'
import { Response } from 'express'
import { IUser } from '@bilbomd/mongodb-schema'
import { getEnvVar } from '../../config/config.js'

const accessTokenSecret = getEnvVar('ACCESS_TOKEN_SECRET')
const refreshTokenSecret = getEnvVar('REFRESH_TOKEN_SECRET')

export async function issueTokensAndSetCookie(
  user: IUser,
  res: Response
): Promise<string> {
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

  const isProduction = process.env.BILBOMD_ENV === 'production'
  res.cookie('jwt', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  })

  return accessToken
}
