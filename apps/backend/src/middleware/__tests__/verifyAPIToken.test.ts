import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { verifyAPIToken } from '../verifyAPIToken.js'

vi.mock('../loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'

const mockUser = (tokenHash: string, expiresAt?: Date | null) => ({
  email: 'api@example.com',
  apiTokens: [{ tokenHash, expiresAt: expiresAt ?? null }]
})

describe('verifyAPIToken middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })
    mockNext = vi.fn()
    mockRequest = { headers: {} }
    mockResponse = {
      status: statusSpy as unknown as Response['status'],
      json: jsonSpy as unknown as Response['json']
    }
  })

  const run = () =>
    verifyAPIToken(mockRequest as Request, mockResponse as Response, mockNext)

  it('calls next() for a valid non-expired token', async () => {
    // The actual hash doesn't matter — we mock findOne to return the user
    mockRequest.headers = { authorization: 'Bearer validtoken123' }
    const futureDate = new Date(Date.now() + 1_000_000)
    // We need to match the real hash. Use a deterministic token so we can match.
    // Instead, mock findOne to return a user with a matching tokenHash for any query.
    vi.mocked(User.findOne).mockResolvedValue(
      mockUser('anyhash', futureDate) as never
    )
    // But findOne checks 'apiTokens.tokenHash', and the user's apiTokens entry
    // must match. We override the user to have our real hash:
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update('validtoken123').digest('hex')
    vi.mocked(User.findOne).mockResolvedValue(mockUser(hash, futureDate) as never)

    await run()

    expect(mockNext).toHaveBeenCalledOnce()
    expect(statusSpy).not.toHaveBeenCalled()
    expect(mockRequest.apiUser).toBeDefined()
  })

  it('returns 401 when Authorization header is missing', async () => {
    mockRequest.headers = {}
    await run()
    expect(statusSpy).toHaveBeenCalledWith(401)
    expect(jsonSpy).toHaveBeenCalledWith({ message: 'Missing or invalid Authorization header' })
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    mockRequest.headers = { authorization: 'Basic sometoken' }
    await run()
    expect(statusSpy).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 403 when no user found for token', async () => {
    mockRequest.headers = { authorization: 'Bearer unknowntoken' }
    vi.mocked(User.findOne).mockResolvedValue(null)
    await run()
    expect(statusSpy).toHaveBeenCalledWith(403)
    expect(jsonSpy).toHaveBeenCalledWith({ message: 'Invalid API token' })
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 403 when token is expired', async () => {
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update('expiredtoken').digest('hex')
    const pastDate = new Date(Date.now() - 1_000_000)
    mockRequest.headers = { authorization: 'Bearer expiredtoken' }
    vi.mocked(User.findOne).mockResolvedValue(mockUser(hash, pastDate) as never)
    await run()
    expect(statusSpy).toHaveBeenCalledWith(403)
    expect(jsonSpy).toHaveBeenCalledWith({ message: 'API token expired' })
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 500 on unexpected error', async () => {
    mockRequest.headers = { authorization: 'Bearer sometoken' }
    vi.mocked(User.findOne).mockRejectedValue(new Error('DB down'))
    await run()
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({ message: 'Internal server error during token verification' })
    expect(mockNext).not.toHaveBeenCalled()
  })
})
