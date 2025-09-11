import { Request, Response } from 'express'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../middleware/loggers.js'
import { issueTokensAndSetCookie } from './authTokens.js'

export async function handleOrcidFinalize(req: Request, res: Response) {
  try {
    const profile = req.session.orcidProfile

    if (!profile || !profile.orcidId || !profile.email) {
      logger.warn('Missing ORCID session profile')
      res.status(400).send('Session expired or invalid')
      return
    }

    const {
      email,
      emailReason,
      givenName,
      familyName,
      orcidId,
      accessToken,
      tokenType,
      refreshToken,
      scope,
      expiresIn,
      name
    } = profile
    // const { username } = req.body

    if (!name || typeof name !== 'string') {
      res.status(400).send('Username is required')
      return
    }

    let user = await User.findOne({ email })

    if (!user) {
      user = new User({
        username: name,
        email,
        firstName: givenName,
        lastName: familyName,
        roles: ['User'],
        status: emailReason ? 'Pending' : 'Active',
        oauth: [
          {
            provider: 'orcid',
            id: orcidId,
            name: name,
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenType: tokenType,
            scope: scope,
            expiresIn: expiresIn
          }
        ]
      })

      await user.save()
      logger.info(`New user created via ORCID: ${email}`)
    } else {
      logger.warn(`User already exists with email ${email}, skipping creation`)
    }

    delete req.session.orcidProfile

    issueTokensAndSetCookie(user, res)
    res.status(200).json({ message: 'New Account created. Happy BilboMDing!' })
  } catch (err) {
    logger.error('Error finalizing ORCID login:', err)
    res.status(500).send('Failed to finalize authentication')
  }
}
