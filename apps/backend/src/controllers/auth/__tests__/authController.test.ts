import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret'),
  isCookieSecure: vi.fn(() => false)
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: vi.fn() }
}))

vi.mock('../authTokens.js', () => ({
  issueTokensAndSetCookie: vi.fn()
}))

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'
import { issueTokensAndSetCookie } from '../authTokens.js'
import { otp } from '../authController.js'

const makeReq = (body: unknown): Request => ({ body } as Request)
const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => vi.clearAllMocks())

describe('otp handler — per-account attempt limiting', () => {
  const makeExpiredOtpUser = (attempts: number) => ({
    active: true,
    username: 'scott',
    email: 'scott@example.com',
    otp: { code: 'abc', expiresAt: new Date(Date.now() - 1000), attempts },
    save: vi.fn()
  })

  it('returns 401 and increments attempts on first expired OTP submission', async () => {
    const mockUser = makeExpiredOtpUser(0)
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)

    await otp(makeReq({ otp: 'abc' }), makeRes())

    expect(mockUser.save).toHaveBeenCalled()
    expect(mockUser.otp.attempts).toBe(1)
  })

  it('returns 429 and nulls OTP when attempt limit is reached on expiry', async () => {
    const mockUser = makeExpiredOtpUser(4)
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)

    const res = makeRes()
    await otp(makeReq({ otp: 'abc' }), res)

    expect(mockUser.otp).toBeNull()
    expect(mockUser.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('returns 429 and nulls OTP when stored attempts already at limit', async () => {
    const mockUser = makeExpiredOtpUser(5)
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)

    const res = makeRes()
    await otp(makeReq({ otp: 'abc' }), res)

    expect(mockUser.otp).toBeNull()
    expect(res.status).toHaveBeenCalledWith(429)
  })

  it('clears OTP (resetting attempts) on successful login', async () => {
    const mockUser = {
      active: true,
      username: 'scott',
      email: 'scott@example.com',
      otp: { code: 'abc', expiresAt: new Date(Date.now() + 60000), attempts: 2 },
      save: vi.fn()
    }
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)
    vi.mocked(issueTokensAndSetCookie).mockResolvedValue('access-token')

    const res = makeRes()
    await otp(makeReq({ otp: 'abc' }), res)

    expect(mockUser.otp).toBeNull()
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'access-token' })
  })
})

describe('otp handler — NoSQL injection prevention', () => {
  it('casts an object payload to string, querying with a literal string', async () => {
    const req = makeReq({ otp: { $gt: '' } })
    const res = makeRes()

    vi.mocked(User.findOne).mockResolvedValue(null)

    await otp(req, res)

    // The injected object is cast to '[object Object]' — findOne receives a plain
    // string, never a MongoDB operator object
    expect(User.findOne).toHaveBeenCalledWith({ 'otp.code': '[object Object]' })
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('casts an array payload to its comma-joined string', async () => {
    const req = makeReq({ otp: ['a', 'b'] })
    const res = makeRes()

    vi.mocked(User.findOne).mockResolvedValue(null)

    await otp(req, res)

    expect(User.findOne).toHaveBeenCalledWith({ 'otp.code': 'a,b' })
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 400 when otp field is absent', async () => {
    const req = makeReq({})
    const res = makeRes()

    await otp(req, res)

    expect(User.findOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('issues tokens for a valid string OTP', async () => {
    const mockUser = {
      active: true,
      username: 'scott',
      email: 'scott@example.com',
      otp: { expiresAt: new Date(Date.now() + 60000) },
      save: vi.fn()
    }
    vi.mocked(User.findOne).mockResolvedValue(mockUser as never)
    vi.mocked(issueTokensAndSetCookie).mockResolvedValue('access-token')

    const req = makeReq({ otp: 'abc123def456abc123def456abc123def4' })
    const res = makeRes()

    await otp(req, res)

    expect(User.findOne).toHaveBeenCalledWith({
      'otp.code': 'abc123def456abc123def456abc123def4'
    })
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'access-token' })
  })
})
