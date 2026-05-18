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

    const { email, givenName, familyName, orcidId, name } = profile

    if (!name || typeof name !== 'string') {
      res.status(400).send('Display name is required')
      return
    }

    // Opaque internal identifier — deterministic, unique by construction,
    // URL-safe, and decoupled from any human-readable display name. See
    // PR 3 of issue #817 (Option A). The human-readable label is derived
    // from firstName + lastName at JWT-sign time by userDisplayName().
    const username = `orcid-${orcidId}`

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
      username,
      email,
      firstName: givenName,
      lastName: familyName,
      roles: ['User'],
      status: 'Active',
      // H3: we no longer persist ORCID access/refresh tokens. We never call
      // ORCID APIs on the user's behalf after sign-in, so storing the
      // bearer just enlarges the blast radius if the DB is leaked.
      oauth: [
        {
          provider: 'orcid',
          id: orcidId,
          name
        }
      ]
    })

    await user.save()
    logger.info(`New user created via ORCID: ${email} (${username})`)

    delete req.session.orcidProfile

    await issueTokensAndSetCookie(user, res)
    res.status(200).json({ message: 'New Account created. Happy BilboMDing!' })
  } catch (err) {
    logger.error('Error finalizing ORCID login:', err)
    res.status(500).send('Failed to finalize authentication')
  }
}
