import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { getAllJobs, getJobById } from '../getJobs.js'

// Hoist mock functions
const {
  mockJobFind,
  mockJobFindOne,
  mockMultiJobFind,
  mockMultiJobFindOne,
  mockUserFindOne,
  mockUserFindById
} = vi.hoisted(() => ({
  mockJobFind: vi.fn(),
  mockJobFindOne: vi.fn(),
  mockMultiJobFind: vi.fn(),
  mockMultiJobFindOne: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockUserFindById: vi.fn()
}))

// Mock dependencies
vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../utils/jobDTOMapper.js', () => ({
  buildBilboMDJobDTO: vi.fn((params) => ({
    id: params.jobId,
    title: 'Test Job',
    username: params.username,
    type: 'pdb'
  })),
  buildMultiJobDTO: vi.fn((params) => ({
    id: params.jobId,
    title: 'Test MultiJob',
    username: params.username,
    type: 'multi'
  }))
}))

// Mock mongoose models
vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: {
    find: mockJobFind,
    findOne: mockJobFindOne
  },
  MultiJob: {
    find: mockMultiJobFind,
    findOne: mockMultiJobFindOne
  },
  User: {
    findOne: mockUserFindOne,
    findById: mockUserFindById
  }
}))

const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response
  return res
}

describe('getAllJobs', () => {
  let mockReq: Partial<Request>
  let mockRes: Response

  beforeEach(() => {
    vi.clearAllMocks()
    mockReq = {}
    mockRes = createMockResponse()

    // Default mock implementations
    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      })
    })

    mockMultiJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      })
    })
  })

  it('should return 400 if username is missing', async () => {
    mockReq.user = undefined
    mockReq.roles = ['User']

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Username is required'
    })
  })

  it('should return 400 if roles are missing', async () => {
    mockReq.user = 'testuser'
    mockReq.roles = undefined

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'User roles are required'
    })
  })

  it('should return 400 if roles is not an array', async () => {
    mockReq.user = 'testuser'
    mockReq.roles = 'User' as unknown as string[]

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'User roles are required'
    })
  })

  it('should return 404 if non-admin user is not found in database', async () => {
    mockReq.user = 'testuser'
    mockReq.roles = ['User']

    mockUserFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(404)
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not found' })
  })

  it('should fetch all jobs for Admin users without filtering', async () => {
    const userId = new Types.ObjectId()
    mockReq.user = 'adminuser'
    mockReq.roles = ['Admin']

    const mockJobs = [
      {
        _id: new Types.ObjectId(),
        title: 'Job 1',
        user: { _id: userId, username: 'user1' }
      }
    ]

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockJobs)
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockJobFind).toHaveBeenCalledWith({})
    expect(mockRes.status).toHaveBeenCalledWith(200)
  })

  it('should fetch all jobs for Manager users without filtering', async () => {
    const userId = new Types.ObjectId()
    mockReq.user = 'manageruser'
    mockReq.roles = ['Manager']

    const mockJobs = [
      {
        _id: new Types.ObjectId(),
        title: 'Job 1',
        user: { _id: userId, username: 'user1' }
      }
    ]

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockJobs)
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockJobFind).toHaveBeenCalledWith({})
    expect(mockRes.status).toHaveBeenCalledWith(200)
  })

  it('should filter jobs by user ID for regular users', async () => {
    const userId = new Types.ObjectId()
    mockReq.user = 'testuser'
    mockReq.roles = ['User']

    mockUserFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: userId, username: 'testuser' })
    })

    const mockJobs = [
      {
        _id: new Types.ObjectId(),
        title: 'Job 1',
        user: { _id: userId, username: 'testuser' }
      }
    ]

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockJobs)
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockJobFind).toHaveBeenCalledWith({
      $or: [{ user: userId }, { 'user._id': userId }]
    })
    expect(mockRes.status).toHaveBeenCalledWith(200)
  })

  it('should return 204 if no jobs are found', async () => {
    mockReq.user = 'adminuser'
    mockReq.roles = ['Admin']

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      })
    })

    mockMultiJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([])
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(204)
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'No jobs found' })
  })

  it('should combine Job and MultiJob results', async () => {
    const userId = new Types.ObjectId()
    mockReq.user = 'adminuser'
    mockReq.roles = ['Admin']

    const mockJobs = [
      {
        _id: new Types.ObjectId(),
        title: 'Job 1',
        user: { _id: userId, username: 'user1' }
      }
    ]

    const mockMultiJobs = [
      {
        _id: new Types.ObjectId(),
        title: 'MultiJob 1',
        user: { _id: userId, username: 'user1' }
      }
    ]

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockJobs)
        })
      })
    })

    mockMultiJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockMultiJobs)
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    const jsonMock = mockRes.json as ReturnType<typeof vi.fn>
    const response = jsonMock.mock.calls[0][0]
    expect(response).toHaveLength(2)
  })

  it('should skip jobs without _id', async () => {
    const userId = new Types.ObjectId()
    mockReq.user = 'adminuser'
    mockReq.roles = ['Admin']

    const mockJobs = [
      { title: 'Invalid Job', user: { _id: userId, username: 'user1' } }, // Missing _id
      {
        _id: new Types.ObjectId(),
        title: 'Valid Job',
        user: { _id: userId, username: 'user1' }
      }
    ]

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockJobs)
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    const jsonMock = mockRes.json as ReturnType<typeof vi.fn>
    const response = jsonMock.mock.calls[0][0]
    expect(response).toHaveLength(1)
  })

  it('should handle errors gracefully', async () => {
    mockReq.user = 'testuser'
    mockReq.roles = ['Admin']

    mockJobFind.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(new Error('Database error'))
        })
      })
    })

    await getAllJobs(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(500)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Internal Server Error - getAllJobs'
    })
  })
})

describe('getJobById', () => {
  let mockReq: Partial<Request>
  let mockRes: Response

  beforeEach(() => {
    vi.clearAllMocks()
    mockReq = { params: {} }
    mockRes = createMockResponse()

    // Default mock implementations
    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      })
    })

    mockMultiJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      })
    })
  })

  it('should return 400 if job ID is missing', async () => {
    mockReq.params = {}

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Job ID required.' })
  })

  it('should return 400 if job ID format is invalid', async () => {
    mockReq.params = { id: 'invalid-id' }

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Invalid Job ID format.'
    })
  })

  it('should return 404 if job is not found', async () => {
    const validId = new Types.ObjectId().toString()
    mockReq.params = { id: validId }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      })
    })

    mockMultiJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(404)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: `No job matches ID ${validId}.`
    })
  })

  it('should return a regular job if found', async () => {
    const userId = new Types.ObjectId()
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockJob = {
      _id: jobId,
      title: 'Test Job',
      user: { _id: userId, username: 'testuser' }
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: jobId.toString(),
        title: 'Test Job'
      })
    )
  })

  it('should return a multi job if regular job not found', async () => {
    const userId = new Types.ObjectId()
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockMultiJob = {
      _id: jobId,
      title: 'Test MultiJob',
      user: { _id: userId, username: 'testuser' }
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null)
      })
    })

    mockMultiJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockMultiJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: jobId.toString(),
        title: 'Test MultiJob'
      })
    )
  })

  it('should return 500 if job found but missing _id', async () => {
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockJob = {
      title: 'Test Job',
      user: { username: 'testuser' }
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(500)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Job data integrity error.'
    })
  })

  it('should handle array job IDs by taking first element', async () => {
    const userId = new Types.ObjectId()
    const jobId = new Types.ObjectId()
    mockReq.params = { id: [jobId.toString(), 'other-id'] as unknown as string }

    const mockJob = {
      _id: jobId,
      title: 'Test Job',
      user: { _id: userId, username: 'testuser' }
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
  })

  it('should handle database errors gracefully', async () => {
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(500)
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve job.'
    })
  })

  it('should resolve username from populated user object', async () => {
    const userId = new Types.ObjectId()
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockJob = {
      _id: jobId,
      title: 'Test Job',
      user: { _id: userId, username: 'testuser' }
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    const jsonMock = mockRes.json as ReturnType<typeof vi.fn>
    const response = jsonMock.mock.calls[0][0]
    expect(response.username).toBe('testuser')
  })

  it('should resolve username from user ID when not populated', async () => {
    const userId = new Types.ObjectId()
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockJob = {
      _id: jobId,
      title: 'Test Job',
      user: userId
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    mockUserFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: userId, username: 'testuser' })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockUserFindById).toHaveBeenCalledWith(userId)
    expect(mockRes.status).toHaveBeenCalledWith(200)
  })

  it('should return "anonymous" for null user', async () => {
    const jobId = new Types.ObjectId()
    mockReq.params = { id: jobId.toString() }

    const mockJob = {
      _id: jobId,
      title: 'Test Job',
      user: null
    }

    mockJobFindOne.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockJob)
      })
    })

    await getJobById(mockReq as Request, mockRes)

    expect(mockRes.status).toHaveBeenCalledWith(200)
    const jsonMock = mockRes.json as ReturnType<typeof vi.fn>
    const response = jsonMock.mock.calls[0][0]
    expect(response.username).toBe('anonymous')
  })
})
