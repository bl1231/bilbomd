import jwt from 'jsonwebtoken'
import { Response } from 'express'
import { IUser, User } from '@bilbomd/mongodb-schema'
import { getEnvVar, isCookieSecure } from '../../config/config.js'
import { logger } from '../../middleware/loggers.js'
import { userDisplayName } from './displayName.js'

const accessTokenSecret = getEnvVar('ACCESS_TOKEN_SECRET')
const refreshTokenSecret = getEnvVar('REFRESH_TOKEN_SECRET')

// Access tokens last two minutes, so a refresh arrives that often from every
// open tab. Only write `last_access` once per window to keep that cheap.
const LAST_ACCESS_WINDOW_MS = 5 * 60 * 1000

// Record when the account was last seen. Fire-and-forget: a failure here must
// never block a login, so it is logged and otherwise ignored.
export const recordLastAccess = (user: IUser, now = new Date()): void => {
  const last = user.last_access?.getTime() ?? 0
  if (now.getTime() - last < LAST_ACCESS_WINDOW_MS) return
  if (!user._id) return
  User.updateOne({ _id: user._id }, { last_access: now })
    .exec()
    .catch((error: unknown) => {
      logger.error(
        `Failed to record last_access for ${user.username}: ${error}`
      )
    })
}

export async function issueTokensAndSetCookie(
  user: IUser,
  res: Response
): Promise<string> {
  recordLastAccess(user)

  const accessToken = jwt.sign(
    {
      UserInfo: {
        username: user.username,
        displayName: userDisplayName(user),
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

  res.cookie('jwt', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  })

  return accessToken
}
