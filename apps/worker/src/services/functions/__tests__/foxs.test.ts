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

// Keep the real ProcessError: the GPU path tells failures apart with instanceof
vi.mock('../../../helpers/runProcess.js', async () => ({
  ...(await vi.importActual<typeof import('../../../helpers/runProcess.js')>(
    '../../../helpers/runProcess.js'
  )),
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

import {
  batchByDir,
  foxsConcurrency,
  foxsGpuOptions,
  spawnFoXSOptimized
} from '../foxs-functions.js'
import { ProcessError } from '../../../helpers/runProcess.js'
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

describe('foxsConcurrency', () => {
  it('uses every effective CPU', () => {
    expect(foxsConcurrency(18)).toBe(18)
    expect(foxsConcurrency(32)).toBe(32)
  })

  it('never goes below one process', () => {
    expect(foxsConcurrency(0)).toBe(1)
  })

  it('prefers an explicit positive override', () => {
    expect(foxsConcurrency(18, 4)).toBe(4)
    expect(foxsConcurrency(18, 0)).toBe(18)
  })
})

describe('spawnFoXSOptimized', () => {
  it('runs FoXS once per PDB file, in its directory, with the FoXS timeout', async () => {
    const a = await makeDirWithPdbs('rg20', 2)
    const b = await makeDirWithPdbs('rg30', 1)

    await spawnFoXSOptimized([a, b], undefined, 2)

    expect(runProcessMock).toHaveBeenCalledTimes(3)
    const calls: SpawnProcessOptions[] = runProcessMock.mock.calls.map(
      (c) => c[0]
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

const GPU = { bin: '/opt/foxs-gpu', batchSize: 3, concurrency: 1 }

// What foxs-gpu --gpu -p a.pdb b.pdb does: write a.pdb.dat, b.pdb.dat in cwd
const writeProfiles = async (opts: SpawnProcessOptions) => {
  for (const f of (opts.args ?? []).filter((a) => a.endsWith('.pdb'))) {
    await fs.writeFile(path.join(opts.cwd ?? '', `${f}.dat`), '')
  }
  return { code: 0 }
}

const processError = (
  overrides: Partial<ProcessError['result']> = {}
): ProcessError =>
  new ProcessError('FoXS GPU batch', GPU.bin, {
    code: 1,
    signal: null,
    timedOut: false,
    aborted: false,
    stderrTail: [],
    ...overrides
  })

const gpuCalls = () =>
  runProcessMock.mock.calls.filter(([o]) => o.cmd === GPU.bin)
const cpuCalls = () =>
  runProcessMock.mock.calls.filter(([o]) => o.cmd === config.foxBin)

describe('batchByDir', () => {
  it('splits each directory into batches without mixing directories', () => {
    const task = (dir: string, i: number) => ({
      dir,
      file: `m${i}.pdb`,
      fullPath: path.join(dir, `m${i}.pdb`)
    })
    const tasks = [
      ...[0, 1, 2, 3, 4].map((i) => task('/a', i)),
      ...[0, 1].map((i) => task('/b', i))
    ]
    const sizes = batchByDir(tasks, 2).map((b) => [b[0].dir, b.length])
    expect(sizes).toEqual([
      ['/a', 2],
      ['/a', 2],
      ['/a', 1],
      ['/b', 2]
    ])
  })
})

describe('spawnFoXSOptimized on the GPU', () => {
  it('runs batched foxs-gpu calls per directory and skips CPU FoXS', async () => {
    runProcessMock.mockImplementation(writeProfiles)
    const a = await makeDirWithPdbs('rg_20', 4)
    const b = await makeDirWithPdbs('rg_30', 2)

    await spawnFoXSOptimized([a, b], undefined, 4, undefined, GPU)

    expect(cpuCalls()).toHaveLength(0)
    expect(gpuCalls().map(([o]) => [o.cwd, o.args])).toEqual([
      [a, ['--gpu', '-p', 'md_0.pdb', 'md_1.pdb', 'md_2.pdb']],
      [a, ['--gpu', '-p', 'md_3.pdb']],
      [b, ['--gpu', '-p', 'md_0.pdb', 'md_1.pdb']]
    ])
    expect(gpuCalls()[0][0].timeoutMs).toBe(config.processTimeouts.foxsMs)
  })

  it('falls back to CPU FoXS for everything when the GPU is unavailable', async () => {
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      if (opts.cmd === GPU.bin) {
        throw processError({
          code: 2,
          stderrTail: ['Cannot use --gpu: no CUDA device']
        })
      }
      return { code: 0 }
    })
    const dir = await makeDirWithPdbs('rg_20', 7)

    await spawnFoXSOptimized([dir], undefined, 4, undefined, GPU)

    // The first batch finds out; the other two never call foxs-gpu
    expect(gpuCalls()).toHaveLength(1)
    expect(cpuCalls()).toHaveLength(7)
  })

  it('retries only a failed batch on the CPU', async () => {
    let call = 0
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      if (opts.cmd === GPU.bin && call++ === 0)
        throw processError({ code: 139 })
      return opts.cmd === GPU.bin ? writeProfiles(opts) : { code: 0 }
    })
    const dir = await makeDirWithPdbs('rg_20', 6)

    await spawnFoXSOptimized([dir], undefined, 4, undefined, GPU)

    expect(gpuCalls()).toHaveLength(2)
    expect(cpuCalls().map(([o]) => o.args)).toEqual([
      ['-p', 'md_0.pdb'],
      ['-p', 'md_1.pdb'],
      ['-p', 'md_2.pdb']
    ])
  })

  it('reruns files whose profile foxs-gpu did not write', async () => {
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      if (opts.cmd !== GPU.bin) return { code: 0 }
      await writeProfiles({
        ...opts,
        args: opts.args?.filter((a) => a !== 'md_1.pdb')
      })
      return { code: 0 }
    })
    const dir = await makeDirWithPdbs('rg_20', 3)

    await spawnFoXSOptimized([dir], undefined, 4, undefined, GPU)

    expect(cpuCalls().map(([o]) => o.args)).toEqual([['-p', 'md_1.pdb']])
  })

  it('stops without CPU fallback when the job is cancelled', async () => {
    runProcessMock.mockRejectedValue(processError({ aborted: true }))
    const dir = await makeDirWithPdbs('rg_20', 3)

    await expect(
      spawnFoXSOptimized([dir], undefined, 4, undefined, GPU)
    ).rejects.toBeInstanceOf(ProcessError)
    expect(cpuCalls()).toHaveLength(0)
  })

  it('reports progress across GPU batches', async () => {
    runProcessMock.mockImplementation(writeProfiles)
    const dir = await makeDirWithPdbs('rg_20', 100)
    const MQjob = {
      updateProgress: vi.fn(),
      log: vi.fn()
    } as unknown as BullMQJob

    await spawnFoXSOptimized([dir], MQjob, 4, undefined, {
      ...GPU,
      batchSize: 30
    })

    // 30, 60, 90 and 100 done: progress crosses 50 and 100
    expect(MQjob.updateProgress).toHaveBeenCalledTimes(2)
    expect(MQjob.updateProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'FoXS: 100/100 (100%)' })
    )
  })
})

describe('foxsGpuOptions', () => {
  const saved = { ...config.foxsGpu }
  afterEach(() => {
    Object.assign(config.foxsGpu, saved)
  })

  it('is off by default', () => {
    expect(config.foxsGpu.mode).toBe('off')
    expect(foxsGpuOptions()).toBeUndefined()
  })

  it('uses CPU FoXS when foxs-gpu is missing', () => {
    Object.assign(config.foxsGpu, { mode: 'auto', bin: path.join(tmp, 'nope') })
    expect(foxsGpuOptions()).toBeUndefined()
  })

  it('returns the GPU settings in auto mode when foxs-gpu exists', async () => {
    const bin = path.join(tmp, 'foxs-gpu')
    await fs.writeFile(bin, '')
    Object.assign(config.foxsGpu, {
      mode: 'auto',
      bin,
      batchSize: 40,
      concurrency: 6
    })
    expect(foxsGpuOptions()).toEqual({ bin, batchSize: 40, concurrency: 6 })
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
