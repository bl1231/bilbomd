import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import type { Request, Response } from 'express'

const { state, mockJobFindOne } = vi.hoisted(() => ({
  state: { dataVol: '' },
  mockJobFindOne: vi.fn()
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findOne: mockJobFindOne }
}))

vi.mock('../../../config/config.js', () => ({
  getEnvVar: () => state.dataVol
}))

// The controller reads DATA_VOL when it is imported
state.dataVol = fs.mkdtempSync(path.join(os.tmpdir(), 'public-file-'))
const { downloadPublicJobResultFile, isPublicResultFile } =
  await import('../downloadPublicJobResultFile.js')

const jobDir = path.join(state.dataVol, 'u1')

const makeRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    sendFile: vi.fn()
  } as unknown as Response
  vi.mocked(res.status).mockReturnValue(res)
  return res
}

const makeReq = (filename: string) =>
  ({ params: { publicId: 'tok', filename } }) as unknown as Request

beforeEach(async () => {
  vi.clearAllMocks()
  mockJobFindOne.mockReturnValue({
    exec: vi.fn().mockResolvedValue({ uuid: 'u1' })
  })
  await fs.emptyDir(jobDir)
  await fs.outputFile(path.join(jobDir, 'pae.png'), 'png')
  await fs.outputFile(path.join(jobDir, 'params.json'), '{}')
  await fs.outputFile(path.join(jobDir, 'qa_ident.txt'), 'x')
  await fs.outputFile(path.join(jobDir, 'const.inp'), 'return')
  await fs.outputFile(
    path.join(jobDir, 'results', 'ensemble_size_2_model.pdb'),
    'pdb'
  )
})

afterAll(async () => {
  await fs.remove(state.dataVol)
})

describe('isPublicResultFile', () => {
  it.each([
    'ensemble_size_1_model.pdb',
    'ensemble_size_12_model.pdb',
    'minimization_output.pdb',
    'scoper_combined_top_model.pdb',
    'pae.png',
    'viz.png',
    'alignment.json'
  ])('allows %s', (name) => {
    expect(isPublicResultFile(name)).toBe(true)
  })

  it.each([
    'params.json',
    'const.inp',
    'saxs.dat',
    'gasans-error.log',
    'qa_ident.txt',
    'ensemble_size_x_model.pdb',
    'pae.png.bak',
    '../pae.png',
    'results/pae.png',
    'scoper_combined_../x.pdb',
    ''
  ])('refuses %j', (name) => {
    expect(isPublicResultFile(name)).toBe(false)
  })
})

describe('downloadPublicJobResultFile', () => {
  it('serves an allowed file from the job dir', async () => {
    const res = makeRes()
    await downloadPublicJobResultFile(makeReq('pae.png'), res)
    expect(res.sendFile).toHaveBeenCalledWith(path.join(jobDir, 'pae.png'))
  })

  it('serves an allowed file from the results dir', async () => {
    const res = makeRes()
    await downloadPublicJobResultFile(makeReq('ensemble_size_2_model.pdb'), res)
    expect(res.sendFile).toHaveBeenCalledWith(
      path.join(jobDir, 'results', 'ensemble_size_2_model.pdb')
    )
  })

  it.each(['params.json', 'qa_ident.txt', 'const.inp'])(
    'answers 404 for %s even though it exists, without a job lookup',
    async (name) => {
      const res = makeRes()
      await downloadPublicJobResultFile(makeReq(name), res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.sendFile).not.toHaveBeenCalled()
      expect(mockJobFindOne).not.toHaveBeenCalled()
    }
  )

  it('answers 404 for an allowed name that is missing', async () => {
    const res = makeRes()
    await downloadPublicJobResultFile(makeReq('viz.png'), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.sendFile).not.toHaveBeenCalled()
  })
})
