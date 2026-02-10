// apps/backend/src/middleware/__tests__/verifyJWT.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { verifyJWT } from '../verifyJWT.js'
import jwt from 'jsonwebtoken'

vi.mock('jsonwebtoken')

interface DecodedJWT {
  UserInfo: {
    username: string
    roles: string[]
    email: string
  }
  iat: number
  exp: number
}

describe('verifyJWT middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })

    mockRequest = {
      headers: {}
    }

    mockResponse = {
      status: statusSpy as unknown as Response['status'],
      json: jsonSpy as unknown as Response['json']
    }

    mockNext = vi.fn()
  })

  describe('successful authentication', () => {
    it('should decode valid token and set user info on request', () => {
      const mockDecoded: DecodedJWT = {
        UserInfo: {
          username: 'testuser',
          roles: ['User'],
          email: 'test@example.com'
        },
        iat: 1234567890,
        exp: 1234567900
      }

      mockRequest.headers = {
        authorization: 'Bearer valid.token.here'
      }

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(null, mockDecoded)
          }
          return undefined
        }
      )

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(mockRequest.user).toBe('testuser')
      expect(mockRequest.roles).toEqual(['User'])
      expect(mockRequest.email).toBe('test@example.com')
      expect(mockNext).toHaveBeenCalledOnce()
      expect(statusSpy).not.toHaveBeenCalled()
    })

    it('should handle case-insensitive authorization header', () => {
      const mockDecoded: DecodedJWT = {
        UserInfo: {
          username: 'testuser',
          roles: ['Admin'],
          email: 'admin@example.com'
        },
        iat: 1234567890,
        exp: 1234567900
      }

      mockRequest.headers = {
        Authorization: 'Bearer valid.token.here'
      }

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(null, mockDecoded)
          }
          return undefined
        }
      )

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(mockRequest.user).toBe('testuser')
      expect(mockRequest.roles).toEqual(['Admin'])
      expect(mockNext).toHaveBeenCalledOnce()
    })
  })

  describe('authentication failures', () => {
    it('should return 401 when authorization header is missing', () => {
      mockRequest.headers = {}

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({ message: 'Unauthorized' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization header does not start with "Bearer "', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token.here'
      }

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({ message: 'Unauthorized' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization header is just "Bearer" without token', () => {
      mockRequest.headers = {
        authorization: 'Bearer'
      }

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(jsonSpy).toHaveBeenCalledWith({ message: 'Unauthorized' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 403 when token signature is invalid', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid.token.signature'
      }

      const mockError = new Error('invalid signature')

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(mockError as never, undefined)
          }
          return undefined
        }
      )

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Forbidden - ',
        error: mockError
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 403 when token is expired', () => {
      mockRequest.headers = {
        authorization: 'Bearer expired.token.here'
      }

      const mockError = new Error('jwt expired')

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(mockError as never, undefined)
          }
          return undefined
        }
      )

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Forbidden - ',
        error: mockError
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 403 when decoded token has no UserInfo', () => {
      mockRequest.headers = {
        authorization: 'Bearer token.without.userinfo'
      }

      const mockDecoded = {
        iat: 1234567890,
        exp: 1234567900
      }

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(null, mockDecoded)
          }
          return undefined
        }
      )

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Forbidden - no userInfo'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('token verification', () => {
    it('should call jwt.verify with correct parameters', () => {
      const token = 'test.jwt.token'
      mockRequest.headers = {
        authorization: `Bearer ${token}`
      }

      const mockDecoded: DecodedJWT = {
        UserInfo: {
          username: 'testuser',
          roles: ['User'],
          email: 'test@example.com'
        },
        iat: 1234567890,
        exp: 1234567900
      }

      vi.mocked(jwt.verify).mockImplementation(
        (_token, _secret, _options, callback) => {
          if (callback && typeof callback === 'function') {
            callback(null, mockDecoded)
          }
          return undefined
        }
      )

      process.env.ACCESS_TOKEN_SECRET = 'test-secret'

      verifyJWT(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      )

      expect(jwt.verify).toHaveBeenCalledWith(
        token,
        'test-secret',
        { algorithms: ['HS256'] },
        expect.any(Function)
      )
    })
  })
})
