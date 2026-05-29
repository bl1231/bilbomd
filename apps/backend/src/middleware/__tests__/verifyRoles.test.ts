import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { verifyRoles } from '../verifyRoles.js'

describe('verifyRoles middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let sendStatusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    sendStatusSpy = vi.fn()
    mockNext = vi.fn()
    mockRequest = {}
    mockResponse = { sendStatus: sendStatusSpy as unknown as Response['sendStatus'] }
  })

  const run = (roles: string[], allowedRoles: string[]) => {
    mockRequest.roles = roles
    verifyRoles(...allowedRoles)(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    )
  }

  it('calls next() when user has an allowed role', () => {
    run(['User'], ['User'])
    expect(mockNext).toHaveBeenCalledOnce()
    expect(sendStatusSpy).not.toHaveBeenCalled()
  })

  it('calls next() when user has one of multiple allowed roles', () => {
    run(['Manager'], ['Admin', 'Manager'])
    expect(mockNext).toHaveBeenCalledOnce()
  })

  it('calls next() when user has Admin role among several roles', () => {
    run(['User', 'Admin'], ['Admin'])
    expect(mockNext).toHaveBeenCalledOnce()
  })

  it('returns 401 when user has no matching role', () => {
    run(['User'], ['Admin'])
    expect(sendStatusSpy).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 401 when req.roles is undefined', () => {
    mockRequest.roles = undefined
    verifyRoles('User')(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    )
    expect(sendStatusSpy).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('returns 401 when roles array is empty', () => {
    run([], ['User'])
    expect(sendStatusSpy).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })
})
