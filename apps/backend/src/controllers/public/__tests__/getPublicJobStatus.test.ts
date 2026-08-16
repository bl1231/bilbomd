import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { getPublicJobById } from '../getPublicJobStatus.js'
import { publicJobQuery } from '../utils/publicJobQuery.js'

const { mockJobFindOne } = vi.hoisted(() => ({
  mockJobFindOne: vi.fn()
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../../jobs/utils/jobDTOMapper.js', () => ({
  mapDiscriminatorToJobType: vi.fn(() => 'pdb')
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: {
    findOne: mockJobFindOne
  }
}))

const makeRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  } as unknown as Response
  vi.mocked(res.status).mockReturnValue(res)
  return res
}

const makeJob = () => ({
  _id: new Types.ObjectId(),
  uuid: 'job-uuid',
  __t: 'BilboMdPDB',
  status: 'Completed',
  progress: 100,
  time_submitted: new Date(),
  results: {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('publicJobQuery', () => {
  it('matches anonymous jobs by public_id and user jobs by results_token', () => {
    expect(publicJobQuery('some-token')).toEqual({
      $or: [
        { public_id: 'some-token', access_mode: 'anonymous' },
        { results_token: 'some-token' }
      ]
    })
  })
})

describe('getPublicJobById', () => {
  it('looks the job up by public_id or results_token', async () => {
    mockJobFindOne.mockReturnValue({
      lean: () => ({ exec: async () => makeJob() })
    })
    const req = { params: { publicId: 'token-abc' } } as unknown as Request
    const res = makeRes()

    await getPublicJobById(req, res)

    expect(mockJobFindOne).toHaveBeenCalledWith({
      $or: [
        { public_id: 'token-abc', access_mode: 'anonymous' },
        { results_token: 'token-abc' }
      ]
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: 'token-abc', status: 'Completed' })
    )
  })

  it('returns 404 when no job matches the token', async () => {
    mockJobFindOne.mockReturnValue({
      lean: () => ({ exec: async () => null })
    })
    const req = { params: { publicId: 'unknown-token' } } as unknown as Request
    const res = makeRes()

    await getPublicJobById(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 400 when publicId is missing', async () => {
    const req = { params: {} } as unknown as Request
    const res = makeRes()

    await getPublicJobById(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockJobFindOne).not.toHaveBeenCalled()
  })
})
