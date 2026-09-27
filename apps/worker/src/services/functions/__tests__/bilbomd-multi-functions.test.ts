import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import type { IMultiJob } from '@bilbomd/mongodb-schema'

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnMultiFoxs } from '../bilbomd-multi-functions.js'
import { config } from '../../../config/config.js'

const makeJob = (overrides: Partial<IMultiJob> = {}) =>
  ({
    uuid: 'multi-uuid',
    title: 'multi',
    data_file_from: 'job-a',
    bilbomd_jobs: [
      { uuid: 'job-a', data_file: 'saxs_a.dat' },
      { uuid: 'job-b', data_file: 'saxs_b.dat' }
    ],
    ...overrides
  }) as unknown as IMultiJob

describe('bilbomd-multi-functions - spawnMultiFoxs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue({ code: 0 })
  })

  it("fits against the chosen job's SAXS data from <uuid>/multifoxs", async () => {
    await spawnMultiFoxs(makeJob())

    const multiDir = path.join(config.uploadDir, 'multi-uuid', 'multifoxs')
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'MultiFoXS',
        cmd: config.multifoxsBin,
        args: [
          '-o',
          path.join(config.uploadDir, 'job-a', 'saxs_a.dat'),
          '../multi_md_foxs_files.txt'
        ],
        cwd: multiDir,
        stdoutFile: path.join(multiDir, 'multi_foxs.log'),
        stderrFile: path.join(multiDir, 'multi_foxs_error.log'),
        timeoutMs: config.processTimeouts.multifoxsMs
      })
    )
  })

  it('does not run MultiFoXS when the data source job is missing', async () => {
    await expect(
      spawnMultiFoxs(makeJob({ data_file_from: 'nope' }))
    ).rejects.toThrow('No job found in bilbomd_jobs')
    expect(runProcessMock).not.toHaveBeenCalled()
  })

  it('propagates MultiFoXS failures', async () => {
    runProcessMock.mockRejectedValue(
      new Error('MultiFoXS timed out after 7200s')
    )

    await expect(spawnMultiFoxs(makeJob())).rejects.toThrow(
      'MultiFoXS timed out after 7200s'
    )
  })
})
