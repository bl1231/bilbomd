import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { Job as BullMQJob } from 'bullmq'
import type { IJob } from '@bilbomd/mongodb-schema'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

const { runProcessMock, updateStepStatusMock, findByIdAndUpdateMock } =
  vi.hoisted(() => ({
    runProcessMock: vi.fn(),
    updateStepStatusMock: vi.fn(),
    findByIdAndUpdateMock: vi.fn()
  }))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual = await vi.importActual<
    typeof import('@bilbomd/mongodb-schema')
  >('@bilbomd/mongodb-schema')
  return {
    ...actual,
    Job: { findByIdAndUpdate: findByIdAndUpdateMock }
  }
})

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnFoXSOptimized } from '../foxs-functions.js'
import { runSingleFoXS } from '../foxs-analysis.js'
import { config } from '../../../config/config.js'

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  findByIdAndUpdateMock.mockResolvedValue(null)
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'foxs-test-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})

const makeDirWithPdbs = async (name: string, count: number) => {
  const dir = path.join(tmp, name)
  await fs.ensureDir(dir)
  for (let i = 0; i < count; i++) {
    await fs.writeFile(path.join(dir, `md_${i}.pdb`), '')
  }
  await fs.writeFile(path.join(dir, 'notes.txt'), '')
  return dir
}

describe('spawnFoXSOptimized', () => {
  it('runs FoXS once per PDB file, in its directory, with the FoXS timeout', async () => {
    const a = await makeDirWithPdbs('rg20', 2)
    const b = await makeDirWithPdbs('rg30', 1)

    await spawnFoXSOptimized([a, b], undefined, 2)

    expect(runProcessMock).toHaveBeenCalledTimes(3)
    const calls = runProcessMock.mock.calls.map(
      ([o]: [SpawnProcessOptions]) => o
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        label: 'FoXS md_0.pdb',
        cmd: config.foxBin,
        args: ['-p', 'md_0.pdb'],
        cwd: a,
        timeoutMs: config.processTimeouts.foxsMs
      })
    )
    // stdout isn't consumed, so no log file or callback is attached
    expect(calls[0].stdoutFile).toBeUndefined()
    expect(calls[0].onStdoutLine).toBeUndefined()
  })

  it('tolerates some failures as long as at least one file succeeds', async () => {
    const dir = await makeDirWithPdbs('rg20', 3)
    runProcessMock
      .mockRejectedValueOnce(new Error('FoXS md_0.pdb exited with code 1'))
      .mockResolvedValue({ code: 0 })

    await expect(spawnFoXSOptimized([dir], undefined, 1)).resolves.toBe(
      undefined
    )
  })

  it('throws when every FoXS run fails', async () => {
    const dir = await makeDirWithPdbs('rg20', 2)
    runProcessMock.mockRejectedValue(new Error('FoXS timed out after 900s'))

    await expect(spawnFoXSOptimized([dir], undefined, 1)).rejects.toThrow(
      'All 2 FoXS processes failed'
    )
  })

  it('reports progress to BullMQ and the foxs step every 50 files', async () => {
    const dir = await makeDirWithPdbs('rg20', 100)
    const MQjob = {
      updateProgress: vi.fn(),
      log: vi.fn()
    } as unknown as BullMQJob
    const DBjob = { _id: 'job-id' } as unknown as Parameters<
      typeof spawnFoXSOptimized
    >[3]

    await spawnFoXSOptimized([dir], MQjob, 4, DBjob)

    expect(MQjob.updateProgress).toHaveBeenCalledTimes(2)
    expect(MQjob.updateProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'FoXS: 100/100 (100%)' })
    )
    expect(findByIdAndUpdateMock).toHaveBeenCalledTimes(2)
  })

  it('returns quietly when there are no PDB files', async () => {
    await spawnFoXSOptimized([path.join(tmp, 'missing')], undefined, 1)
    expect(runProcessMock).not.toHaveBeenCalled()
  })
})

describe('runSingleFoXS', () => {
  const makeJob = async (md_engine?: string) => {
    const uuid = 'single-foxs'
    const jobDir = path.join(config.uploadDir, uuid)
    await fs.ensureDir(jobDir)
    // 3 data lines + a comment: profile size is count - 1 = 2
    await fs.writeFile(
      path.join(jobDir, 'exp.dat'),
      '# q I err\n0.01 1 0.1\n0.02 1 0.1\n0.03 1 0.1\n'
    )
    return { uuid, data_file: 'exp.dat', md_engine } as unknown as IJob
  }

  afterEach(async () => {
    await fs.remove(path.join(config.uploadDir, 'single-foxs'))
  })

  it('fits the minimized OpenMM model and marks the step successful', async () => {
    const job = await makeJob('OpenMM')

    await runSingleFoXS(job)

    expect(runProcessMock.mock.calls[0][0]).toMatchObject({
      label: 'Initial FoXS',
      cmd: config.foxBin,
      cwd: path.join(config.uploadDir, 'single-foxs'),
      stdoutFile: expect.stringMatching(/initial_foxs_analysis\.log$/),
      stderrFile: expect.stringMatching(/initial_foxs_analysis_error\.log$/),
      timeoutMs: config.processTimeouts.foxsMs
    })
    const args = runProcessMock.mock.calls[0][0].args
    expect(args).toContain('--profile_size=2')
    expect(args.slice(-2)).toEqual(['openmm/minimize/minimized.pdb', 'exp.dat'])
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'initfoxs', {
      status: 'Success',
      message: 'Initial FoXS Calculations have completed successfully.'
    })
  })

  it('records the failure on the step without throwing', async () => {
    const job = await makeJob('CHARMM')
    runProcessMock.mockRejectedValue(
      new Error('Initial FoXS exited with code 1')
    )

    await expect(runSingleFoXS(job)).resolves.toBeUndefined()
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'initfoxs', {
      status: 'Error',
      message: 'FoXS analysis error: Initial FoXS exited with code 1'
    })
  })
})
