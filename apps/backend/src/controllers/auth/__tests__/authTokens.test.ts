import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret'),
  isCookieSecure: vi.fn(() => false)
}))

import { issueTokensAndSetCookie } from '../authTokens.js'

const makeUser = (overrides: Partial<IUser> = {}): IUser =>
  ({
    username: 'orcid-0000-0002-1234-5678',
    email: 'scott@example.com',
    firstName: 'Scott',
    lastName: 'Classen',
    roles: ['User'],
    ...overrides
  }) as unknown as IUser

const makeRes = (): Response => {
  const res = {} as Response
  res.cookie = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => vi.clearAllMocks())

describe('issueTokensAndSetCookie', () => {
  it('includes displayName claim derived from firstName + lastName', async () => {
    const accessToken = await issueTokensAndSetCookie(makeUser(), makeRes())
    const decoded = jwt.verify(accessToken, 'test-secret') as {
      UserInfo: { username: string; displayName: string; email: string }
    }

    expect(decoded.UserInfo.displayName).toBe('Scott Classen')
    expect(decoded.UserInfo.username).toBe('orcid-0000-0002-1234-5678')
    expect(decoded.UserInfo.email).toBe('scott@example.com')
  })

  it('falls back to username when firstName + lastName are absent', async () => {
    const accessToken = await issueTokensAndSetCookie(
      makeUser({
        firstName: null as unknown as string,
        lastName: null as unknown as string,
        username: 'legacy_user'
      }),
      makeRes()
    )
    const decoded = jwt.verify(accessToken, 'test-secret') as {
      UserInfo: { displayName: string }
    }

    expect(decoded.UserInfo.displayName).toBe('legacy_user')
  })

  it('sets the refresh token cookie', async () => {
    const res = makeRes()
    await issueTokensAndSetCookie(makeUser(), res)

    expect(res.cookie).toHaveBeenCalledWith(
      'jwt',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      })
    )
  })
})
