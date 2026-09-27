import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

const { runProcessMock, updateStepStatusMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  updateStepStatusMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnMultiFoxs } from '../multifoxs.js'
import { config } from '../../../config/config.js'

const lastOpts = (): SpawnProcessOptions =>
  runProcessMock.mock.calls.at(-1)?.[0]

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'multifoxs-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})
describe('spawnMultiFoxs', () => {
  it('runs MultiFoXS in <out_dir>/multifoxs against the SAXS data', async () => {
    await spawnMultiFoxs({ out_dir: '/jobs/u1', data_file: 'exp.dat' })

    expect(lastOpts()).toEqual(
      expect.objectContaining({
        label: 'MultiFoXS',
        cmd: config.multifoxsBin,
        args: ['-o', '/jobs/u1/exp.dat', 'foxs_dat_files.txt'],
        cwd: '/jobs/u1/multifoxs',
        stdoutFile: '/jobs/u1/multifoxs/multi_foxs.log',
        stderrFile: '/jobs/u1/multifoxs/multi_foxs_error.log',
        timeoutMs: config.processTimeouts.multifoxsMs
      })
    )
  })

  it('propagates MultiFoXS failures', async () => {
    runProcessMock.mockRejectedValue(new Error('MultiFoXS exited with code 1'))

    await expect(
      spawnMultiFoxs({ out_dir: '/jobs/u1', data_file: 'exp.dat' })
    ).rejects.toThrow('MultiFoXS exited with code 1')
  })
})
