import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { IBilboMDAutoJob } from '@bilbomd/mongodb-schema'
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

import { runAutoRg } from '../autorg.js'
import { config } from '../../../config/config.js'

const lastOpts = (): SpawnProcessOptions =>
  runProcessMock.mock.calls.at(-1)?.[0]

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'autorg-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})
describe('runAutoRg', () => {
  const makeJob = () =>
    ({
      uuid: 'autorg-job',
      data_file: 'exp.dat',
      save: vi.fn().mockResolvedValue(undefined)
    }) as unknown as IBilboMDAutoJob & { save: ReturnType<typeof vi.fn> }

  // autorg.py writes its results to the temp file passed as its last arg
  const writeResults = (results: object) =>
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      await fs.writeFile(opts.args!.at(-1)!, JSON.stringify(results))
      return { code: 0 }
    })

  it('stores rg, rg_min and rg_max on the job and marks the step done', async () => {
    writeResults({ rg: 25, rg_min: 20, rg_max: 35 })
    const job = makeJob()

    await runAutoRg(job)

    expect(lastOpts()).toMatchObject({
      label: 'AutoRg',
      args: ['/app/scripts/autorg.py', 'exp.dat', expect.any(String)],
      cwd: path.join(config.uploadDir, 'autorg-job'),
      stdoutFile: expect.stringMatching(/autoRg\.log$/),
      timeoutMs: config.processTimeouts.helperScriptMs
    })
    expect(job).toMatchObject({ rg: 25, rg_min: 20, rg_max: 35 })
    expect(job.save).toHaveBeenCalledTimes(1)
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'autorg', {
      status: 'Success',
      message: 'Calculate Rg completed successfully.'
    })
    // temp results file is cleaned up
    expect(await fs.pathExists(lastOpts().args!.at(-1)!)).toBe(false)
  })

  it('marks the step as failed and rethrows when autorg.py fails', async () => {
    runProcessMock.mockRejectedValue(new Error('AutoRg exited with code 1'))
    const job = makeJob()

    await expect(runAutoRg(job)).rejects.toThrow('AutoRg exited with code 1')
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'autorg', {
      status: 'Error',
      message: 'AutoRg exited with code 1'
    })
    expect(job.save).not.toHaveBeenCalled()
  })

  it('rejects and cleans up when the results file is not valid JSON', async () => {
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      await fs.writeFile(opts.args!.at(-1)!, 'not json')
      return { code: 0 }
    })

    await expect(runAutoRg(makeJob())).rejects.toThrow(SyntaxError)
    expect(await fs.pathExists(lastOpts().args!.at(-1)!)).toBe(false)
  })
})
