import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { Types } from 'mongoose'

const { mockJobFindOne, mockMultiJobFindOne, mockAccess } = vi.hoisted(() => ({
  mockJobFindOne: vi.fn(),
  mockMultiJobFindOne: vi.fn(),
  mockAccess: vi.fn()
}))

vi.mock('../../config/config.js', () => ({
  getEnvVar: vi.fn().mockReturnValue('/data')
}))

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('fs-extra', () => ({
  default: { promises: { access: mockAccess } }
}))

vi.mock('../../services/foxs/foxsDataService.js', () => ({
  buildBilboFoxsData: vi.fn(),
  buildMultiFoxsData: vi.fn(),
  buildScoperFoxsData: vi.fn()
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findOne: mockJobFindOne },
  MultiJob: { findOne: mockMultiJobFindOne }
}))

import { downloadPDB, getFoxsData } from '../foxsController.js'
import {
  buildBilboFoxsData,
  buildMultiFoxsData
} from '../../services/foxs/foxsDataService.js'

const jobId = new Types.ObjectId().toString()

const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    sendFile: vi.fn()
  }
  return res as unknown as Response & typeof res
}

describe('downloadPDB', () => {
  let res: ReturnType<typeof createMockResponse>

  beforeEach(() => {
    vi.clearAllMocks()
    res = createMockResponse()
    mockAccess.mockResolvedValue(undefined)
  })

  it('returns 400 when the job id is missing', async () => {
    const req = { params: { pdb: 'model.pdb' } } as unknown as Request
    await downloadPDB(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Job ID required.' })
  })

  it('returns 400 when the pdb filename is missing', async () => {
    const req = { params: { id: jobId } } as unknown as Request
    await downloadPDB(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'PDB filename required.' })
  })

  it('returns 404 when no job matches the id', async () => {
    mockJobFindOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) })
    const req = {
      params: { id: jobId, pdb: 'model.pdb' }
    } as unknown as Request
    await downloadPDB(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      message: `No job matches ID ${jobId}.`
    })
    expect(res.sendFile).not.toHaveBeenCalled()
  })

  it('sends the PDB from the job results directory', async () => {
    mockJobFindOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ uuid: 'abc-123' })
    })
    const req = {
      params: { id: jobId, pdb: 'model.pdb' }
    } as unknown as Request
    await downloadPDB(req, res)
    expect(mockAccess).toHaveBeenCalledWith('/data/abc-123/results/model.pdb')
    expect(res.sendFile).toHaveBeenCalledWith(
      '/data/abc-123/results/model.pdb',
      expect.any(Function)
    )
  })

  it('strips directory components from the pdb filename', async () => {
    mockJobFindOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ uuid: 'abc-123' })
    })
    const req = {
      params: { id: jobId, pdb: '../../etc/passwd' }
    } as unknown as Request
    await downloadPDB(req, res)
    expect(res.sendFile).toHaveBeenCalledWith(
      '/data/abc-123/results/passwd',
      expect.any(Function)
    )
  })

  it('returns 500 when the PDB file is not accessible', async () => {
    mockJobFindOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ uuid: 'abc-123' })
    })
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    const req = {
      params: { id: jobId, pdb: 'missing.pdb' }
    } as unknown as Request
    await downloadPDB(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.sendFile).not.toHaveBeenCalled()
  })
})

describe('getFoxsData', () => {
  let res: ReturnType<typeof createMockResponse>
  const req = { params: { id: jobId } } as unknown as Request

  // Job.findOne(...).exec() for the job lookup; the Multi data-source lookup
  // goes through .select().lean().exec()
  const jobLookup = (job: object | null, source: object | null = null) =>
    mockJobFindOne.mockImplementation((filter: Record<string, unknown>) =>
      'uuid' in filter
        ? {
            select: () => ({ lean: () => ({ exec: async () => source }) })
          }
        : { exec: async () => job }
    )

  beforeEach(() => {
    vi.clearAllMocks()
    res = createMockResponse()
  })

  it('returns 404 when neither a job nor a Multi job matches', async () => {
    jobLookup(null)
    mockMultiJobFindOne.mockReturnValue({ exec: async () => null })

    await getFoxsData(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('builds a regular job without looking for a Multi job', async () => {
    const job = { uuid: 'run-a', __t: 'BilboMdPDB' }
    jobLookup(job)
    vi.mocked(buildBilboFoxsData).mockResolvedValue([])

    await getFoxsData(req, res)

    expect(buildBilboFoxsData).toHaveBeenCalledWith(job)
    expect(mockMultiJobFindOne).not.toHaveBeenCalled()
  })

  it("builds a Multi job's fits against its data-source run", async () => {
    const multiJob = { uuid: 'multi', data_file_from: 'run-a' }
    const source = { uuid: 'run-a', data_file: 'saxs.dat' }
    jobLookup(null, source)
    mockMultiJobFindOne.mockReturnValue({ exec: async () => multiJob })
    vi.mocked(buildMultiFoxsData).mockResolvedValue([])

    await getFoxsData(req, res)

    expect(mockJobFindOne).toHaveBeenCalledWith({ uuid: 'run-a' })
    expect(buildMultiFoxsData).toHaveBeenCalledWith(multiJob, source)
    expect(res.json).toHaveBeenCalledWith([])
  })
})
