import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { verifyAccountOwnership } from '../verifyAccountOwnership.js'

describe('verifyAccountOwnership middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let statusSpy: ReturnType<typeof vi.fn>
  let jsonSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockNext = vi.fn()
    jsonSpy = vi.fn()
    statusSpy = vi.fn(() => ({ json: jsonSpy }))
    mockRequest = { params: {}, body: {} }
    mockResponse = {
      status: statusSpy as unknown as Response['status']
    }
  })

  const run = (source: 'params' | 'body') =>
    verifyAccountOwnership(source)(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    )

  it('calls next() when the caller owns the account (params)', () => {
    mockRequest.user = 'alice'
    mockRequest.params = { username: 'alice' }
    run('params')
    expect(mockNext).toHaveBeenCalledOnce()
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('calls next() when the caller owns the account (body)', () => {
    mockRequest.user = 'alice'
    mockRequest.body = { username: 'alice' }
    run('body')
    expect(mockNext).toHaveBeenCalledOnce()
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('returns 403 when acting on another user (params)', () => {
    mockRequest.user = 'alice'
    mockRequest.params = { username: 'bob' }
    run('params')
    expect(mockNext).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(403)
  })

  it('returns 403 when acting on another user (body)', () => {
    mockRequest.user = 'alice'
    mockRequest.body = { username: 'bob' }
    run('body')
    expect(mockNext).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(403)
  })

  it('returns 401 when no authenticated user is present', () => {
    mockRequest.params = { username: 'alice' }
    run('params')
    expect(mockNext).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(401)
  })

  it('returns 403 when the target username is missing', () => {
    mockRequest.user = 'alice'
    mockRequest.body = {}
    run('body')
    expect(mockNext).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(403)
  })

  it('does not allow a non-owner even with privileged roles (self-only)', () => {
    mockRequest.user = 'admin'
    mockRequest.roles = ['Admin']
    mockRequest.params = { username: 'bob' }
    run('params')
    expect(mockNext).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(403)
  })
})
