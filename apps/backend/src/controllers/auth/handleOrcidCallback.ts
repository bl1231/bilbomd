import { Request, Response } from 'express'
import axios from 'axios'
import { authorizationCodeGrant } from 'openid-client'
import { User } from '@bilbomd/mongodb-schema'
import { issueTokensAndSetCookie } from './authTokens.js'
import { discovered } from './orcidClientConfig.js'
import { logger } from '../../middleware/loggers.js'
import { redactTokens } from '../../middleware/redactTokens.js'
import { getEnvVar } from '../../config/config.js'

type OrcidEmailEntry = { email?: string; verified?: boolean; primary?: boolean }

const clearOauthCookies = (res: Response) => {
  res.clearCookie('orcid_oauth_state')
  res.clearCookie('orcid_oauth_nonce')
}

export async function handleOrcidCallback(req: Request, res: Response) {
  const storedState = req.cookies.orcid_oauth_state
  const storedNonce = req.cookies.orcid_oauth_nonce

  if (!storedState || !storedNonce) {
    logger.warn('ORCID callback hit without state/nonce cookies')
    res.status(400).send('Missing OAuth session — please restart the sign-in flow')
    return
  }

  // Build the URL openid-client will inspect for code+state. Use the
  // app's canonical BILBOMD_URL rather than trusting req headers behind
  // a proxy.
  const baseUrl = getEnvVar('BILBOMD_URL')
  const currentUrl = new URL(req.originalUrl, baseUrl)

  let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>
  try {
    // authorizationCodeGrant performs ID-token validation end-to-end:
    // signature against the discovered JWKS, iss / aud claims, nonce
    // matches expectedNonce, exp not in the past, and state matches
    // expectedState.
    tokens = await authorizationCodeGrant(discovered, currentUrl, {
      expectedState: storedState,
      expectedNonce: storedNonce,
      idTokenExpected: true
    })
  } catch (err) {
    logger.error('ORCID authorization-code grant / ID-token verification failed', err)
    clearOauthCookies(res)
    return res.redirect('/auth/orcid-error?reason=token_exchange')
  }

  logger.info(
    `Received ORCID tokenSet: ${JSON.stringify(redactTokens(tokens as unknown as Record<string, unknown>))}`
  )

  const claims = tokens.claims()
  if (!claims || !claims.sub) {
    logger.error('ORCID ID token missing claims or sub')
    clearOauthCookies(res)
    return res.redirect('/auth/orcid-error?reason=missing_id_token')
  }

  const orcidId = claims.sub
  const givenName =
    typeof claims.given_name === 'string' ? claims.given_name : undefined
  const familyName =
    typeof claims.family_name === 'string' ? claims.family_name : undefined
  const displayName =
    typeof claims.name === 'string' ? claims.name : undefined

  // Email is not part of the openid scope on ORCID; fetch from the Public API.
  let userinfo: { person?: { emails?: { email?: unknown } } }
  try {
    const orcidPubUrl = getEnvVar('ORCID_PUBLIC_API_URL')
    const userinfoRes = await axios.get(`${orcidPubUrl}/${orcidId}`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/orcid+json'
      }
    })
    userinfo = userinfoRes.data
  } catch (err) {
    logger.error('ORCID public-API user-info fetch failed', err)
    clearOauthCookies(res)
    return res.redirect('/auth/orcid-error?reason=userinfo_fetch')
  }
  logger.info(
    `ORCID user info: ${JSON.stringify(redactTokens(userinfo as Record<string, unknown>))}`
  )

  // C2: require a primary AND verified email. No fallback to other verified
  // emails or to unverified ones — an attacker can list arbitrary unverified
  // emails on their ORCID profile, so we must not trust them as identity.
  const emailList = Array.isArray(userinfo.person?.emails?.email)
    ? (userinfo.person.emails.email as OrcidEmailEntry[])
    : []
  const selectedEmail = emailList.find(
    (entry) => entry.primary && entry.verified
  )?.email

  if (!selectedEmail) {
    logger.warn(
      `ORCID profile ${orcidId} has no primary verified email — refusing sign-in`
    )
    clearOauthCookies(res)
    return res.redirect('/auth/orcid-error?reason=no_primary_verified')
  }

  // Look up an existing user by the verified ORCID email.
  const user = await User.findOne({ email: selectedEmail })

  // C1: refuse to issue tokens for an account that exists under this email
  // but has no ORCID link for this ORCID iD. Otherwise anyone who can pass
  // ORCID's flow for a profile listing the victim's verified email would be
  // signed in as the victim's existing (e.g., legacy magic-link) account.
  if (user) {
    const isOrcidLinked = user.oauth.some(
      (entry) => entry.provider === 'orcid' && entry.id === orcidId
    )
    if (!isOrcidLinked) {
      logger.warn(
        `ORCID sign-in refused: email ${selectedEmail} is registered without an ORCID link for ${orcidId}`
      )
      clearOauthCookies(res)
      return res.redirect('/auth/orcid-error?reason=email_already_registered')
    }

    if (user.status === 'Active') {
      logger.info(
        `Existing ORCID-linked user ${user.email} authenticated. Skipping confirmation.`
      )
      clearOauthCookies(res)
      await issueTokensAndSetCookie(user, res)
      return res.redirect('/welcome')
    }
  }

  // New user — stash the verified profile for the confirmation step. Only
  // fields the finalize handler actually needs are persisted to the session.
  req.session.orcidProfile = {
    email: selectedEmail,
    givenName,
    familyName,
    orcidId,
    accessToken: tokens.access_token,
    tokenType: tokens.token_type,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    expiresIn: tokens.expires_in,
    name: displayName
  }

  clearOauthCookies(res)
  return res.redirect('/auth/orcid-confirmation')
}
