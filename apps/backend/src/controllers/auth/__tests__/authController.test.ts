import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('test-secret')
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
