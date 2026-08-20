import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { Types } from 'mongoose'
import type { IUser } from '@bilbomd/mongodb-schema'
import { verifyJobOwnership } from '../verifyJobOwnership.js'

const { mockJobExists, mockMultiJobExists, mockUserFindOne } = vi.hoisted(
  () => ({
    mockJobExists: vi.fn(),
    mockMultiJobExists: vi.fn(),
    mockUserFindOne: vi.fn()
  })
)

vi.mock('../loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { exists: mockJobExists },
  MultiJob: { exists: mockMultiJobExists },
  User: { findOne: mockUserFindOne }
}))

const userId = new Types.ObjectId()
const jobId = new Types.ObjectId().toString()

describe('verifyJobOwnership middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let statusSpy: ReturnType<typeof vi.fn>
  let jsonSpy: ReturnType<typeof vi.fn>

  const mockUserLookup = (user: { _id: Types.ObjectId } | null) => {
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(user)
      })
    })
  }

  const run = () =>
    verifyJobOwnership(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    )

  beforeEach(() => {
    vi.clearAllMocks()
    mockNext = vi.fn()
    jsonSpy = vi.fn()
    statusSpy = vi.fn(() => ({ json: jsonSpy }))
    mockRequest = { params: { id: jobId } }
    mockResponse = { status: statusSpy as unknown as Response['status'] }
    mockUserLookup({ _id: userId })
    mockJobExists.mockResolvedValue(null)
    mockMultiJobExists.mockResolvedValue(null)
  })

  describe('id validation', () => {
    it('returns 400 when the id is missing', async () => {
      mockRequest.params = {}
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      await run()
      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('returns 400 when the id is not a 24-hex ObjectId', async () => {
      mockRequest.params = { id: 'not-an-object-id' }
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      await run()
      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ message: 'Invalid Job ID format.' })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('JWT-authenticated requests', () => {
    it('returns 401 when no authenticated user is present', async () => {
      await run()
      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(mockNext).not.toHaveBeenCalled()
      expect(mockUserFindOne).not.toHaveBeenCalled()
    })

    it('calls next() for Admin without touching the database', async () => {
      mockRequest.user = 'admin'
      mockRequest.roles = ['Admin']
      await run()
      expect(mockNext).toHaveBeenCalledOnce()
      expect(statusSpy).not.toHaveBeenCalled()
      expect(mockUserFindOne).not.toHaveBeenCalled()
      expect(mockJobExists).not.toHaveBeenCalled()
      expect(mockMultiJobExists).not.toHaveBeenCalled()
    })

    it('calls next() for Manager without touching the database', async () => {
      mockRequest.user = 'manager'
      mockRequest.roles = ['User', 'Manager']
      await run()
      expect(mockNext).toHaveBeenCalledOnce()
      expect(statusSpy).not.toHaveBeenCalled()
      expect(mockJobExists).not.toHaveBeenCalled()
    })

    it('calls next() when the user owns the Job', async () => {
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      mockJobExists.mockResolvedValue({ _id: jobId })
      await run()
      expect(mockUserFindOne).toHaveBeenCalledWith({ username: 'alice' })
      expect(mockJobExists).toHaveBeenCalledWith({
        _id: jobId,
        $or: [{ user: userId }, { 'user._id': userId }]
      })
      expect(mockMultiJobExists).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalledOnce()
      expect(statusSpy).not.toHaveBeenCalled()
    })

    it('calls next() when the user owns the MultiJob', async () => {
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      mockJobExists.mockResolvedValue(null)
      mockMultiJobExists.mockResolvedValue({ _id: jobId })
      await run()
      expect(mockMultiJobExists).toHaveBeenCalledWith({
        _id: jobId,
        $or: [{ user: userId }, { 'user._id': userId }]
      })
      expect(mockNext).toHaveBeenCalledOnce()
      expect(statusSpy).not.toHaveBeenCalled()
    })

    it('returns 404 when the job belongs to someone else', async () => {
      mockRequest.user = 'bob'
      mockRequest.roles = ['User']
      await run()
      expect(mockNext).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(404)
      expect(jsonSpy).toHaveBeenCalledWith({
        message: `No job matches ID ${jobId}.`
      })
    })

    it('returns 404 when the job does not exist at all', async () => {
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      await run()
      expect(mockNext).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(404)
    })

    it('returns 401 when the username has no user record', async () => {
      mockRequest.user = 'ghost'
      mockRequest.roles = ['User']
      mockUserLookup(null)
      await run()
      expect(mockNext).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(401)
      expect(mockJobExists).not.toHaveBeenCalled()
    })

    it('treats missing roles as an ordinary user', async () => {
      mockRequest.user = 'alice'
      mockRequest.roles = undefined
      mockJobExists.mockResolvedValue({ _id: jobId })
      await run()
      expect(mockNext).toHaveBeenCalledOnce()
    })

    it('returns 500 when the database lookup throws', async () => {
      mockRequest.user = 'alice'
      mockRequest.roles = ['User']
      mockJobExists.mockRejectedValue(new Error('boom'))
      await run()
      expect(mockNext).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe('API-token-authenticated requests', () => {
    const apiUser = (roles: string[]) =>
      ({
        _id: userId,
        username: 'api-user',
        roles
      }) as unknown as IUser

    it('calls next() when the API user owns the job', async () => {
      mockRequest.apiUser = apiUser(['User'])
      mockJobExists.mockResolvedValue({ _id: jobId })
      await run()
      expect(mockUserFindOne).not.toHaveBeenCalled()
      expect(mockJobExists).toHaveBeenCalledWith({
        _id: jobId,
        $or: [{ user: userId }, { 'user._id': userId }]
      })
      expect(mockNext).toHaveBeenCalledOnce()
    })

    it('returns 404 when the API user does not own the job', async () => {
      mockRequest.apiUser = apiUser(['User'])
      await run()
      expect(mockNext).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(404)
    })

    it('prefers the JWT identity when both req.user and req.apiUser are set', async () => {
      mockRequest.user = 'admin'
      mockRequest.roles = ['Admin']
      mockRequest.apiUser = apiUser(['User'])
      await run()
      expect(mockNext).toHaveBeenCalledOnce()
      expect(mockJobExists).not.toHaveBeenCalled()
    })

    it('calls next() for an API user with the Admin role', async () => {
      mockRequest.apiUser = apiUser(['Admin'])
      await run()
      expect(mockNext).toHaveBeenCalledOnce()
      expect(mockJobExists).not.toHaveBeenCalled()
    })
  })
})
