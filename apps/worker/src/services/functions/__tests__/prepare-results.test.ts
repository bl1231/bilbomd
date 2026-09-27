import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IJob } from '@bilbomd/mongodb-schema'

const { updateStepStatusMock, makeDirMock, handleErrorMock } = vi.hoisted(
  () => ({
    updateStepStatusMock: vi.fn(),
    makeDirMock: vi.fn(),
    handleErrorMock: vi.fn()
  })
)

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('../job-utils.js', () => ({
  makeDir: makeDirMock,
  handleError: handleErrorMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { prepareBilboMDResults } from '../prepare-results.js'

const statuses = () =>
  updateStepStatusMock.mock.calls.map(([, step, s]) => [step, s.status])

beforeEach(() => {
  vi.clearAllMocks()
  updateStepStatusMock.mockResolvedValue(undefined)
})

describe('prepareBilboMDResults', () => {
  it('records an error, without throwing, for a job with no structure files', async () => {
    const job = { uuid: 'j1', data_file: 'exp.dat' } as unknown as IJob

    await expect(prepareBilboMDResults(job)).resolves.toBeUndefined()

    expect(statuses()).toEqual([
      ['results', 'Running'],
      ['results', 'Error']
    ])
    expect(updateStepStatusMock.mock.calls.at(-1)?.[2].message).toBe(
      'Failed to gather BilboMD results: Invalid job type'
    )
    expect(makeDirMock).not.toHaveBeenCalled()
  })

  it.each([
    'crd_file',
    'pdb_file',
    'pae_file',
    'alphafold_entities',
    'openfold_entities'
  ])('gathers results for a job with %s', async (field) => {
    // Stop prepareResults at its first failure; reaching handleError shows it ran
    handleErrorMock.mockRejectedValue(new Error('stop'))
    const job = { uuid: 'j3', [field]: 'x' } as unknown as IJob

    await prepareBilboMDResults(job)

    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      job,
      'results'
    )
  })

  it('records an error, without throwing, when gathering results fails', async () => {
    // prepareResults hands its failures to handleError, which rethrows
    handleErrorMock.mockRejectedValue(new Error('results step failed'))
    const job = { uuid: 'j2', pdb_file: 'model.pdb' } as unknown as IJob

    await expect(prepareBilboMDResults(job)).resolves.toBeUndefined()

    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      job,
      'results'
    )
    expect(statuses()).toEqual([
      ['results', 'Running'],
      ['results', 'Error']
    ])
    expect(updateStepStatusMock.mock.calls.at(-1)?.[2].message).toBe(
      'Failed to gather BilboMD results: results step failed'
    )
  })
})
