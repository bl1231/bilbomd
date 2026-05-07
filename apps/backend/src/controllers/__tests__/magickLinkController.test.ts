import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../config/config.js', () => ({
  config: { logLevel: 'info', sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('https://bilbomd.example.com')
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: vi.fn() }
}))

vi.mock('../../config/nodemailerConfig.js', () => ({
  sendMagickLinkEmail: vi.fn()
}))

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: () => 'deadbeef00112233445566778899aabb'
    })
  }
}))

import { User } from '@bilbomd/mongodb-schema'
import { generateMagickLink } from '../magickLinkController.js'

const makeReq = (body: unknown): Request => ({ body } as Request)
const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

const execReturning = (value: unknown) =>
  ({ exec: vi.fn().mockResolvedValue(value) }) as never

beforeEach(() => vi.clearAllMocks())

describe('generateMagickLink — NoSQL injection prevention', () => {
  it('casts an object email to string, querying with a literal string', async () => {
    const req = makeReq({ email: { $ne: '' } })
    const res = makeRes()

    vi.mocked(User.findOne).mockReturnValue(execReturning(null))

    await generateMagickLink(req, res)

    // The injected object becomes '[object Object]' — findOne receives a plain
    // string, never a MongoDB operator object
    expect(User.findOne).toHaveBeenCalledWith({ email: '[object Object]' })
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 400 when email is missing', async () => {
    const req = makeReq({})
    const res = makeRes()

    await generateMagickLink(req, res)

    expect(User.findOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 201 for a valid, active user with a plain string email', async () => {
    const mockUser = {
      email: 'scott@example.com',
      status: 'Active',
      active: true,
      otp: null,
      save: vi.fn()
    }
    vi.mocked(User.findOne).mockReturnValue(execReturning(mockUser))

    const req = makeReq({ email: 'scott@example.com' })
    const res = makeRes()

    await generateMagickLink(req, res)

    expect(User.findOne).toHaveBeenCalledWith({ email: 'scott@example.com' })
    expect(res.status).toHaveBeenCalledWith(201)
  })
})
