import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { Job as BullMQJob } from 'bullmq'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

const { runProcessMock, updateOneMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  updateOneMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { updateOne: updateOneMock }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { runGenerateMovies } from '../movie-worker.js'
import { config } from '../../../config/config.js'

let tmp: string
let outDir: string

const makeMQJob = () =>
  ({
    data: {
      jobId: 'job-id',
      label: 'rg_25',
      pdb: path.join(tmp, 'model.pdb'),
      dcd: path.join(tmp, 'traj.dcd'),
      outDir,
      stride: 1,
      width: 640,
      height: 480,
      crf: 23,
      rayEnabled: false
    }
  }) as unknown as BullMQJob

// Simulate PyMOL writing the movie; ffmpeg calls just succeed
const pymolWritesMovie = () =>
  runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
    if (opts.label.startsWith('Movie')) {
      await fs.writeFile(path.join(outDir, 'movie.mp4'), 'mp4')
    }
    return { code: 0 }
  })

const lastSet = () => updateOneMock.mock.calls.at(-1)?.[1].$set

beforeEach(async () => {
  vi.clearAllMocks()
  updateOneMock.mockResolvedValue({})
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-test-'))
  outDir = path.join(tmp, 'movies', 'rg_25')
  await fs.writeFile(path.join(tmp, 'model.pdb'), '')
  await fs.writeFile(path.join(tmp, 'traj.dcd'), '')
})

afterEach(async () => {
  await fs.remove(tmp)
})

describe('movie-worker - runGenerateMovies', () => {
  it('renders with PyMOL, makes poster/thumb with ffmpeg, and marks it ready', async () => {
    pymolWritesMovie()

    await runGenerateMovies(makeMQJob())

    const [pymol, poster, thumb] = runProcessMock.mock.calls.map((c) => c[0])
    expect(pymol).toMatchObject({
      label: 'Movie rg_25',
      cmd: config.openmmPythonBin,
      cwd: outDir,
      stdoutFile: path.join(outDir, 'movie_rg_25.log'),
      stderrFile: path.join(outDir, 'movie_rg_25_error.log'),
      timeoutMs: config.processTimeouts.movieMs
    })
    expect(pymol.args.slice(0, 4)).toEqual([
      '-m',
      'pymol',
      '-cqr',
      '/app/scripts/pymol/make_dcd_movie.py'
    ])
    expect(pymol.env.PATH).toMatch(/^\/opt\/envs\/openmm\/bin:/)
    for (const ff of [poster, thumb]) {
      expect(ff).toMatchObject({
        label: 'ffmpeg',
        cmd: 'ffmpeg',
        cwd: outDir,
        timeoutMs: config.processTimeouts.helperScriptMs
      })
    }
    expect(lastSet()).toMatchObject({
      'assets.movies.$[m].status': 'ready',
      'assets.movies.$[m].mp4': path.join(outDir, 'movie.mp4')
    })
  })

  it('marks the movie failed with the error and rethrows when PyMOL fails', async () => {
    runProcessMock.mockRejectedValue(
      new Error('Movie rg_25 timed out after 3600s')
    )

    await expect(runGenerateMovies(makeMQJob())).rejects.toThrow(
      'Movie rg_25 timed out after 3600s'
    )
    expect(lastSet()).toMatchObject({
      'assets.movies.$[m].status': 'failed',
      'assets.movies.$[m].error': 'Movie rg_25 timed out after 3600s'
    })
  })

  it('still marks the movie ready when poster/thumb generation fails', async () => {
    runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
      if (opts.label === 'ffmpeg') throw new Error('ffmpeg exited with code 1')
      await fs.writeFile(path.join(outDir, 'movie.mp4'), 'mp4')
      return { code: 0 }
    })

    await runGenerateMovies(makeMQJob())

    expect(lastSet()).toMatchObject({ 'assets.movies.$[m].status': 'ready' })
    expect(lastSet()).not.toHaveProperty('assets.movies.$[m].poster')
  })
})
