import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn((name: string) => {
    if (name === 'BILBOMD_URL') return 'http://localhost'
    if (name === 'ORCID_PUBLIC_API_URL') return 'https://pub.orcid.test/v3.0'
    return 'test-value'
  })
}))

const { authorizationCodeGrantMock, findOneMock, axiosGetMock } = vi.hoisted(
  () => ({
    authorizationCodeGrantMock: vi.fn(),
    findOneMock: vi.fn(),
    axiosGetMock: vi.fn()
  })
)

vi.mock('openid-client', () => ({
  authorizationCodeGrant: authorizationCodeGrantMock
}))

vi.mock('../orcidClientConfig.js', () => ({ discovered: {} }))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: findOneMock }
}))

vi.mock('../authTokens.js', () => ({
  issueTokensAndSetCookie: vi.fn().mockResolvedValue('access-token')
}))

vi.mock('axios', () => ({
  default: { get: axiosGetMock }
}))

import { issueTokensAndSetCookie } from '../authTokens.js'
import { handleOrcidCallback } from '../handleOrcidCallback.js'

const ORCID_ID = '0000-0002-1234-5678'

const makeReq = (
  cookies: Record<string, string> = {
    orcid_oauth_state: 'state-cookie',
    orcid_oauth_nonce: 'nonce-cookie'
  }
): Request =>
  ({
    cookies,
    originalUrl: '/api/v1/auth/orcid/callback?code=abc&state=state-cookie',
    session: {} as Request['session']
  }) as unknown as Request

const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  res.clearCookie = vi.fn().mockReturnValue(res)
  return res
}

const tokensWithEmail = (emailList: unknown[]) => {
  authorizationCodeGrantMock.mockResolvedValue({
    access_token: 'orcid-access',
    refresh_token: 'orcid-refresh',
    token_type: 'bearer',
    scope: 'openid',
    expires_in: 3600,
    claims: () => ({
      sub: ORCID_ID,
      given_name: 'Scott',
      family_name: 'Classen',
      name: 'Scott Classen'
    })
  })
  axiosGetMock.mockResolvedValue({
    data: { person: { emails: { email: emailList } } }
  })
}

beforeEach(() => vi.clearAllMocks())

describe('handleOrcidCallback', () => {
  describe('missing OAuth session cookies', () => {
    it('returns 400 when state cookie is missing', async () => {
      const res = makeRes()
      await handleOrcidCallback(makeReq({ orcid_oauth_nonce: 'n' }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
    })

    it('returns 400 when nonce cookie is missing', async () => {
      const res = makeRes()
      await handleOrcidCallback(makeReq({ orcid_oauth_state: 's' }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
    })
  })

  describe('openid-client failure', () => {
    it('redirects to error page when authorizationCodeGrant throws', async () => {
      authorizationCodeGrantMock.mockRejectedValue(new Error('bad nonce'))

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=token_exchange'
      )
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })

    it('redirects to missing_id_token when claims() returns undefined', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'a',
        claims: () => undefined
      })

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=missing_id_token'
      )
      expect(axiosGetMock).not.toHaveBeenCalled()
    })

    it('redirects to missing_id_token when sub claim is absent', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'a',
        claims: () => ({ given_name: 'Scott' })
      })

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=missing_id_token'
      )
    })

    it('passes expectedState and expectedNonce from cookies', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: true, verified: true }
      ])
      findOneMock.mockResolvedValue(null)

      await handleOrcidCallback(makeReq(), makeRes())

      expect(authorizationCodeGrantMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(URL),
        expect.objectContaining({
          expectedState: 'state-cookie',
          expectedNonce: 'nonce-cookie',
          idTokenExpected: true
        })
      )
    })
  })

  describe('userinfo fetch failure', () => {
    it('redirects to userinfo_fetch when the Public-API call throws', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'a',
        claims: () => ({ sub: ORCID_ID })
      })
      axiosGetMock.mockRejectedValue(new Error('network down'))

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=userinfo_fetch'
      )
      expect(findOneMock).not.toHaveBeenCalled()
    })
  })

  describe('C2 — primary verified email required', () => {
    it('redirects to error when no primary verified email is present', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: false, verified: true },
        { email: 'other@example.com', primary: true, verified: false }
      ])

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=no_primary_verified'
      )
      expect(findOneMock).not.toHaveBeenCalled()
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })

    it('redirects to error when email list is empty', async () => {
      tokensWithEmail([])

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=no_primary_verified'
      )
    })
  })

  describe('C1 — account-takeover guard', () => {
    it('refuses when email exists with no ORCID link', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: true, verified: true }
      ])
      findOneMock.mockResolvedValue({
        email: 'scott@example.com',
        status: 'Active',
        oauth: []
      })

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=email_already_registered'
      )
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })

    it('refuses when email exists with a DIFFERENT ORCID iD linked', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: true, verified: true }
      ])
      findOneMock.mockResolvedValue({
        email: 'scott@example.com',
        status: 'Active',
        oauth: [{ provider: 'orcid', id: '0000-0003-9999-9999' }]
      })

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/orcid-error?reason=email_already_registered'
      )
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })
  })

  describe('happy paths', () => {
    it('auto-signs in an existing ORCID-linked Active user', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: true, verified: true }
      ])
      const user = {
        email: 'scott@example.com',
        status: 'Active',
        oauth: [{ provider: 'orcid', id: ORCID_ID }]
      }
      findOneMock.mockResolvedValue(user)

      const res = makeRes()
      await handleOrcidCallback(makeReq(), res)

      expect(issueTokensAndSetCookie).toHaveBeenCalledWith(user, res)
      expect(res.redirect).toHaveBeenCalledWith('/welcome')
    })

    it('routes new users to the confirmation page with profile in session', async () => {
      tokensWithEmail([
        { email: 'scott@example.com', primary: true, verified: true }
      ])
      findOneMock.mockResolvedValue(null)

      const req = makeReq()
      const res = makeRes()
      await handleOrcidCallback(req, res)

      expect(res.redirect).toHaveBeenCalledWith('/auth/orcid-confirmation')
      expect(req.session.orcidProfile).toEqual(
        expect.objectContaining({
          email: 'scott@example.com',
          orcidId: ORCID_ID,
          givenName: 'Scott',
          familyName: 'Classen'
        })
      )
    })
  })
})
