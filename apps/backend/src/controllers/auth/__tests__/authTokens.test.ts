import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import type { IUser } from '@bilbomd/mongodb-schema'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret'),
  isCookieSecure: vi.fn(() => false)
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { updateOne: vi.fn() }
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'
import { logger } from '../../../middleware/loggers.js'
import { issueTokensAndSetCookie, recordLastAccess } from '../authTokens.js'

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

const updateOneChain = (result: Promise<unknown>) => ({ exec: () => result })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(User.updateOne).mockReturnValue(
    updateOneChain(Promise.resolve({})) as never
  )
})

describe('recordLastAccess', () => {
  const now = new Date('2024-06-01T12:00:00Z')

  it('writes last_access the first time an account is seen', () => {
    recordLastAccess(makeUser({ _id: 'u1' as never }), now)
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      { last_access: now }
    )
  })

  it('skips the write when the last one was inside the window', () => {
    recordLastAccess(
      makeUser({
        _id: 'u1' as never,
        last_access: new Date(now.getTime() - 60 * 1000)
      }),
      now
    )
    expect(User.updateOne).not.toHaveBeenCalled()
  })

  it('writes again once the window has passed', () => {
    recordLastAccess(
      makeUser({
        _id: 'u1' as never,
        last_access: new Date(now.getTime() - 10 * 60 * 1000)
      }),
      now
    )
    expect(User.updateOne).toHaveBeenCalledTimes(1)
  })

  it('logs instead of throwing when the write fails', async () => {
    vi.mocked(User.updateOne).mockReturnValue(
      updateOneChain(Promise.reject(new Error('db down'))) as never
    )
    expect(() =>
      recordLastAccess(makeUser({ _id: 'u1' as never }), now)
    ).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(logger.error).toHaveBeenCalled()
  })
})

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

  it('records last access as a side effect', async () => {
    await issueTokensAndSetCookie(makeUser({ _id: 'u1' as never }), makeRes())
    expect(User.updateOne).toHaveBeenCalledTimes(1)
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
