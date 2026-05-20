import { Request, Response } from 'express'
import { User } from '@bilbomd/mongodb-schema'
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

    if (!name || typeof name !== 'string') {
      res.status(400).send('Username is required')
      return
    }

    const existing = await User.findOne({ email })

    if (existing) {
      // C1: defense-in-depth — the callback already refuses this case, but
      // if it ever leaks through, do NOT silently issue tokens for an
      // existing account that has no ORCID link for this ORCID iD.
      const isOrcidLinked = existing.oauth.some(
        (entry) => entry.provider === 'orcid' && entry.id === orcidId
      )
      if (!isOrcidLinked) {
        logger.warn(
          `Finalize refused: email ${email} is registered without an ORCID link for ${orcidId}`
        )
        delete req.session.orcidProfile
        res.status(409).json({
          error: 'email_already_registered',
          message:
            'This email is already registered to a BilboMD account. Please contact an administrator to link your ORCID iD.'
        })
        return
      }

      logger.info(`Existing ORCID-linked user ${email} signed in via finalize`)
      delete req.session.orcidProfile
      await issueTokensAndSetCookie(existing, res)
      res.status(200).json({ message: 'Welcome back!' })
      return
    }

    const user = new User({
      username: name,
      email,
      firstName: givenName,
      lastName: familyName,
      roles: ['User'],
      status: 'Active',
      oauth: [
        {
          provider: 'orcid',
          id: orcidId,
          name,
          accessToken,
          refreshToken,
          tokenType,
          scope,
          expiresIn
        }
      ]
    })

    await user.save()
    logger.info(`New user created via ORCID: ${email}`)

    delete req.session.orcidProfile

    await issueTokensAndSetCookie(user, res)
    res.status(200).json({ message: 'New Account created. Happy BilboMDing!' })
  } catch (err) {
    logger.error('Error finalizing ORCID login:', err)
    res.status(500).send('Failed to finalize authentication')
  }
}
