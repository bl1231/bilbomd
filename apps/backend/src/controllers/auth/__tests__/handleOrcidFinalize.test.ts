import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret')
}))

const { findOneMock, userSaveMock, UserConstructor } = vi.hoisted(() => {
  const userSaveMock = vi.fn()
  const UserConstructor = vi.fn(function (
    this: Record<string, unknown>,
    doc: Record<string, unknown>
  ) {
    Object.assign(this, doc)
    this.save = userSaveMock
  })
  return {
    findOneMock: vi.fn(),
    userSaveMock,
    UserConstructor
  }
})

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: Object.assign(UserConstructor, { findOne: findOneMock })
}))

vi.mock('../authTokens.js', () => ({
  issueTokensAndSetCookie: vi.fn().mockResolvedValue('access-token')
}))

import { issueTokensAndSetCookie } from '../authTokens.js'
import { handleOrcidFinalize } from '../handleOrcidFinalize.js'

const ORCID_ID = '0000-0002-1234-5678'

const makeReq = (overrides: Partial<Request['session']> = {}): Request =>
  ({
    session: {
      orcidProfile: {
        email: 'scott@example.com',
        givenName: 'Scott',
        familyName: 'Classen',
        orcidId: ORCID_ID,
        name: 'Scott Classen'
      },
      ...overrides
    } as Request['session']
  }) as Request

const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  userSaveMock.mockResolvedValue(undefined)
})

describe('handleOrcidFinalize', () => {
  describe('C1 — account-takeover guard', () => {
    it('refuses with 409 when email exists without any ORCID link', async () => {
      findOneMock.mockResolvedValue({
        email: 'scott@example.com',
        oauth: []
      })

      const req = makeReq()
      const res = makeRes()
      await handleOrcidFinalize(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'email_already_registered' })
      )
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
      expect(UserConstructor).not.toHaveBeenCalled()
      expect(req.session.orcidProfile).toBeUndefined()
    })

    it('refuses when email exists with an ORCID link for a DIFFERENT ORCID iD', async () => {
      findOneMock.mockResolvedValue({
        email: 'scott@example.com',
        oauth: [{ provider: 'orcid', id: '0000-0003-9999-9999' }]
      })

      const res = makeRes()
      await handleOrcidFinalize(makeReq(), res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })

    it('signs in existing user when ORCID link matches', async () => {
      const existing = {
        email: 'scott@example.com',
        oauth: [{ provider: 'orcid', id: ORCID_ID }]
      }
      findOneMock.mockResolvedValue(existing)

      const res = makeRes()
      await handleOrcidFinalize(makeReq(), res)

      expect(issueTokensAndSetCookie).toHaveBeenCalledWith(existing, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(UserConstructor).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('creates a new Active user with opaque ORCID-derived username', async () => {
      findOneMock.mockResolvedValue(null)

      const res = makeRes()
      await handleOrcidFinalize(makeReq(), res)

      expect(UserConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          username: `orcid-${ORCID_ID}`,
          email: 'scott@example.com',
          firstName: 'Scott',
          lastName: 'Classen',
          status: 'Active'
        })
      )
      expect(userSaveMock).toHaveBeenCalled()
      expect(issueTokensAndSetCookie).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('does NOT persist ORCID access/refresh tokens on the User document (H3)', async () => {
      findOneMock.mockResolvedValue(null)

      await handleOrcidFinalize(makeReq(), makeRes())

      const constructorArg = UserConstructor.mock.calls[0]?.[0] as {
        oauth: Array<Record<string, unknown>>
      }
      const oauthEntry = constructorArg.oauth[0]

      expect(oauthEntry).toEqual({
        provider: 'orcid',
        id: ORCID_ID,
        name: 'Scott Classen'
      })
      expect(oauthEntry).not.toHaveProperty('accessToken')
      expect(oauthEntry).not.toHaveProperty('refreshToken')
      expect(oauthEntry).not.toHaveProperty('tokenType')
      expect(oauthEntry).not.toHaveProperty('scope')
      expect(oauthEntry).not.toHaveProperty('expiresIn')
    })
  })

  describe('input validation', () => {
    it('returns 400 when session profile is missing', async () => {
      const res = makeRes()
      await handleOrcidFinalize(makeReq({ orcidProfile: undefined }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })

    it('returns 400 when the session profile has no display name', async () => {
      const req = makeReq()
      // Strip the name out of the otherwise-valid profile
      const profile = req.session.orcidProfile
      if (profile) delete profile.name

      const res = makeRes()
      await handleOrcidFinalize(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(findOneMock).not.toHaveBeenCalled()
      expect(issueTokensAndSetCookie).not.toHaveBeenCalled()
    })
  })
})
