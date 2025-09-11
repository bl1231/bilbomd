import { Request, Response } from 'express'
import { clientConfig, discovered } from './orcidClientConfig.js'
import { buildAuthorizationUrl, randomState, randomNonce } from 'openid-client'
import { logger } from '../../middleware/loggers.js'

export async function handleOrcidLogin(req: Request, res: Response) {
  const state = randomState()
  const nonce = randomNonce()

  // Store them in a secure cookie or session
  res.cookie('orcid_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  })

  res.cookie('orcid_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  })

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
