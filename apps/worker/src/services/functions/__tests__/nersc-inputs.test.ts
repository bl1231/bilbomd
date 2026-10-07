import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import type { IJob } from '@bilbomd/mongodb-schema'

const { state, runCifToPdb } = vi.hoisted(() => ({
  state: { uploadDir: '' },
  runCifToPdb: vi.fn()
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    get uploadDir() {
      return state.uploadDir
    }
  }
}))

vi.mock('../pdb-to-crd.js', () => ({ runCifToPdb }))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { prepareNerscInputs } from '../nersc-inputs.js'

const UUID = 'uuid-1'

const makeJob = (fields: Record<string, unknown>) => {
  const doc: Record<string, unknown> = { uuid: UUID, ...fields }
  const job = {
    uuid: UUID,
    get: vi.fn((key: string) => doc[key]),
    set: vi.fn((key: string, value: unknown) => {
      doc[key] = value
    }),
    save: vi.fn(async () => undefined)
  }
  return { job: job as unknown as IJob, doc, mock: job }
}

const paramsPath = () => path.join(state.uploadDir, UUID, 'params.json')

beforeEach(async () => {
  state.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nersc-inputs-'))
  await fs.outputJson(paramsPath(), {
    __t: 'BilboMdAuto',
    pdb_file: 'model.cif',
    rg_min: 20
  })
  runCifToPdb.mockReset()
  runCifToPdb.mockResolvedValue('model.pdb')
})

afterEach(async () => {
  await fs.remove(state.uploadDir)
})

describe('prepareNerscInputs', () => {
  it('converts an mmCIF upload and points the job and params.json at the PDB', async () => {
    const { job, doc, mock } = makeJob({ pdb_file: 'model.cif' })

    await prepareNerscInputs(job)

    expect(runCifToPdb).toHaveBeenCalledWith({
      uuid: UUID,
      pdb_file: 'model.cif'
    })
    expect(doc.pdb_file).toBe('model.pdb')
    expect(mock.save).toHaveBeenCalledOnce()
    expect(await fs.readJson(paramsPath())).toEqual({
      __t: 'BilboMdAuto',
      pdb_file: 'model.pdb',
      rg_min: 20
    })
    expect(await fs.pathExists(`${paramsPath()}.tmp`)).toBe(false)
  })

  it('treats the extension case-insensitively', async () => {
    const { job } = makeJob({ pdb_file: 'MODEL.CIF' })

    await prepareNerscInputs(job)

    expect(runCifToPdb).toHaveBeenCalledOnce()
  })

  it.each([
    ['a PDB upload', { pdb_file: 'model.pdb' }],
    ['a job without a pdb_file (CRD, AlphaFold)', {}]
  ])('leaves %s alone', async (_label, fields) => {
    const before = await fs.readJson(paramsPath())
    const { job, mock } = makeJob(fields)

    await prepareNerscInputs(job)

    expect(runCifToPdb).not.toHaveBeenCalled()
    expect(mock.save).not.toHaveBeenCalled()
    expect(await fs.readJson(paramsPath())).toEqual(before)
  })

  it('fails without touching the job or params.json when conversion fails', async () => {
    runCifToPdb.mockRejectedValue(new Error('cif_to_pdb failed'))
    const before = await fs.readJson(paramsPath())
    const { job, doc, mock } = makeJob({ pdb_file: 'model.cif' })

    await expect(prepareNerscInputs(job)).rejects.toThrow('cif_to_pdb failed')

    expect(doc.pdb_file).toBe('model.cif')
    expect(mock.save).not.toHaveBeenCalled()
    expect(await fs.readJson(paramsPath())).toEqual(before)
  })
})
