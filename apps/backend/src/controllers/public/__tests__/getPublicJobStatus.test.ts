import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { getPublicJobById } from '../getPublicJobStatus.js'
import { publicJobQuery } from '../utils/publicJobQuery.js'

const { mockJobFindOne, mockMapJobMongoToDTO } = vi.hoisted(() => ({
  mockJobFindOne: vi.fn(),
  mockMapJobMongoToDTO: vi.fn()
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../../jobs/utils/jobDTOMapper.js', () => ({
  mapDiscriminatorToJobType: vi.fn(() => 'pdb'),
  mapJobMongoToDTO: mockMapJobMongoToDTO
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
  mockMapJobMongoToDTO.mockReturnValue({})
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

  it('returns the title and only whitelisted inputs, never user details', async () => {
    mockJobFindOne.mockReturnValue({
      lean: () => ({
        exec: async () => ({ ...makeJob(), title: 'My job' })
      })
    })
    mockMapJobMongoToDTO.mockReturnValue({
      data_file: 'saxs.dat',
      pdb_file: 'model.pdb',
      const_inp_file: 'const.inp',
      rg_min: 20,
      rg_max: 40,
      charmm_parameters: { md: { rgyr: { count: 4 } } },
      user: { id: 'u1', username: 'alice', email: 'alice@example.com' },
      access_mode: 'user'
    })
    const req = { params: { publicId: 'token-abc' } } as unknown as Request
    const res = makeRes()

    await getPublicJobById(req, res)

    const body = vi.mocked(res.json).mock.calls[0][0]
    expect(body.title).toBe('My job')
    expect(body.inputs).toMatchObject({
      data_file: 'saxs.dat',
      pdb_file: 'model.pdb',
      const_inp_file: 'const.inp',
      rg_min: 20,
      rg_max: 40,
      charmm_parameters: { md: { rgyr: { count: 4 } } }
    })
    expect(body.inputs).not.toHaveProperty('user')
    expect(body.inputs).not.toHaveProperty('access_mode')
    expect(JSON.stringify(body)).not.toContain('alice@example.com')
  })
})
