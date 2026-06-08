import { Request, Response } from 'express'
import { clientConfig, discovered } from './orcidClientConfig.js'
import { buildAuthorizationUrl, randomState, randomNonce } from 'openid-client'
import { logger } from '../../middleware/loggers.js'
import { isCookieSecure } from '../../config/config.js'

export async function handleOrcidLogin(req: Request, res: Response) {
  const state = randomState()
  const nonce = randomNonce()

  // ORCID redirects back to the same origin, so SameSite=Lax is sufficient
  // and safer than 'none'. The 5-minute lifetime bounds how long a
  // half-finished OAuth flow can sit around.
  const cookieOptions = {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'lax' as const,
    maxAge: 5 * 60 * 1000
  }

  res.cookie('orcid_oauth_state', state, cookieOptions)
  res.cookie('orcid_oauth_nonce', nonce, cookieOptions)

  const authUrl: URL = buildAuthorizationUrl(discovered, {
    client_id: clientConfig.client_id,
    redirect_uri: clientConfig.redirect_uri,
    response_type: clientConfig.response_types[0],
    scope: clientConfig.scope,
    state
  })

  logger.info(`Redirecting to ORCID login: ${authUrl.toString()}`)

  res.redirect(authUrl.toString())
}
