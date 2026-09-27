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

import {
  spawnMultiFoxs,
  spawnPaeToConst,
  runAutoRg
} from '../bilbomd-step-functions.js'
import { config } from '../../../config/config.js'

const lastOpts = (): SpawnProcessOptions =>
  runProcessMock.mock.calls.at(-1)?.[0]

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'step-fns-'))
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

describe('spawnPaeToConst', () => {
  const setup = async () => {
    const script = path.join(tmp, 'pae2const.py')
    await fs.writeFile(script, '')
    await fs.writeFile(path.join(tmp, 'model.pdb'), '')
    await fs.writeFile(path.join(tmp, 'pae.json'), '{}')
    return script
  }

  it('runs pae2const.py appending to af2pae logs, with the helper timeout', async () => {
    const script = await setup()

    const result = await spawnPaeToConst({
      out_dir: tmp,
      in_pdb: 'model.pdb',
      in_pae: 'pae.json',
      plddt_cutoff: 50,
      python_bin: '/usr/bin/python3',
      script_path: script
    })

    expect(result).toBe('0')
    expect(lastOpts()).toEqual(
      expect.objectContaining({
        label: 'pae2const.py',
        cmd: '/usr/bin/python3',
        args: [
          script,
          '--pdb_file',
          'model.pdb',
          '--plddt_cutoff',
          '50',
          'pae.json'
        ],
        cwd: tmp,
        stdoutFile: path.join(tmp, 'af2pae.log'),
        stderrFile: path.join(tmp, 'af2pae_error.log'),
        appendLogs: true,
        timeoutMs: config.processTimeouts.helperScriptMs
      })
    )
  })

  it('does not run when the PAE file is missing', async () => {
    const script = await setup()
    await fs.remove(path.join(tmp, 'pae.json'))

    await expect(
      spawnPaeToConst({
        out_dir: tmp,
        in_pdb: 'model.pdb',
        in_pae: 'pae.json',
        script_path: script
      })
    ).rejects.toThrow('PAE file not found')
    expect(runProcessMock).not.toHaveBeenCalled()
  })

  it('propagates script failures', async () => {
    const script = await setup()
    runProcessMock.mockRejectedValue(
      new Error('pae2const.py exited with code 2')
    )

    await expect(
      spawnPaeToConst({
        out_dir: tmp,
        in_pdb: 'model.pdb',
        in_pae: 'pae.json',
        script_path: script
      })
    ).rejects.toThrow('pae2const.py exited with code 2')
  })
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
