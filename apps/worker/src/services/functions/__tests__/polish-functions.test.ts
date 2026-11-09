import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import type { IJob } from '@bilbomd/mongodb-schema'

const { cfg, runProcess, updateStepStatus } = vi.hoisted(() => ({
  cfg: {
    uploadDir: '',
    openmmPythonBin: '/opt/envs/openmm/bin/python',
    processTimeouts: { openmmSetupMs: 1000 }
  },
  runProcess: vi.fn(),
  updateStepStatus: vi.fn()
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../mongo-utils.js', () => ({ updateStepStatus }))
vi.mock('../../../config/config.js', () => ({ config: cfg }))
vi.mock('../../../helpers/runProcess.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../helpers/runProcess.js')>()
  return { ...actual, runProcess }
})

const { runPolish, findEnsembleMembers, polishedPath, describeResults } =
  await import('../polish-functions.js')
const { ProcessError } = await import('../../../helpers/runProcess.js')

// Two ensemble sizes; rg30/bioemu_rg30_0001 is in both top models, and the
// second-ranked size-2 model must be ignored.
const ENSEMBLE_1 = `1 |  1.12 | x1 1.12 (1.05, -0.50)
    1   | 1.000 (1.000, 0.000) | ../foxs/rg30/bioemu_rg30_0001.pdb.dat (0.500)
`
const ENSEMBLE_2 = `1 |  0.98 | x1 0.98 (1.05, -0.50)
    1   | 0.600 (0.600, 0.010) | ../foxs/rg30/bioemu_rg30_0001.pdb.dat (0.500)
   12   | 0.400 (0.400, 0.010) | ../foxs/rg38/bioemu_rg38_0012.pdb.dat (0.200)
2 |  0.99 | x1 0.99 (1.05, -0.50)
    3   | 0.500 (0.500, 0.010) | ../foxs/rg34/bioemu_rg34_0003.pdb.dat (0.100)
    4   | 0.500 (0.500, 0.010) | ../foxs/rg34/bioemu_rg34_0004.pdb.dat (0.100)
`

let uploadDir: string
let jobDir: string
const job = { uuid: 'uuid-1' } as unknown as IJob

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'polish-'))
  cfg.uploadDir = uploadDir
  jobDir = path.join(uploadDir, 'uuid-1')
  await fs.outputFile(
    path.join(jobDir, 'multifoxs', 'ensembles_size_1.txt'),
    ENSEMBLE_1
  )
  await fs.outputFile(
    path.join(jobDir, 'multifoxs', 'ensembles_size_2.txt'),
    ENSEMBLE_2
  )
  vi.clearAllMocks()
})

afterEach(async () => {
  await fs.remove(uploadDir)
})

const member = (rg: string, n: string) =>
  path.join(jobDir, 'foxs', rg, `bioemu_${rg}_${n}.pdb`)

describe('findEnsembleMembers', () => {
  it('lists each top-model member once', async () => {
    expect(await findEnsembleMembers(jobDir)).toEqual([
      member('rg30', '0001'),
      member('rg38', '0012')
    ])
  })
})

describe('polishedPath', () => {
  it('keeps the Rg directory in the name, so members stay unique', () => {
    expect(polishedPath(jobDir, member('rg30', '0001'))).toBe(
      path.join(jobDir, 'polish', 'rg30_bioemu_rg30_0001.pdb')
    )
  })
})

describe('describeResults', () => {
  it('summarizes the polished members', () => {
    expect(
      describeResults([
        {
          in: 'a',
          out: 'a2',
          ok: true,
          heavy_rmsd: 0.3,
          rg_before: 30,
          rg_after: 29.9
        },
        {
          in: 'b',
          out: 'b2',
          ok: true,
          heavy_rmsd: 0.4,
          rg_before: 38,
          rg_after: 37.9
        },
        { in: 'c', out: 'c2', ok: false, error: 'boom' }
      ])
    ).toBe(
      'Polished 2 of 3 ensemble members (median heavy-atom RMSD 0.35 Å, Rg change -0.10 Å); 1 kept unpolished.'
    )
  })

  it('says so when nothing was polished', () => {
    expect(describeResults([{ in: 'a', out: 'b', ok: false }])).toBe(
      'No ensemble member could be polished.'
    )
  })
})

describe('runPolish', () => {
  it('runs polish.py on the members and records the polished copies', async () => {
    runProcess.mockImplementation(async ({ args }: { args: string[] }) => {
      const jobs = (await fs.readJson(args[1])) as { in: string; out: string }[]
      await fs.writeJson(
        args[2],
        jobs.map((j, i) =>
          i === 0
            ? { ...j, ok: true, heavy_rmsd: 0.3, rg_before: 30, rg_after: 29.9 }
            : { ...j, ok: false, error: 'template' }
        )
      )
    })

    await runPolish(job)

    const [opts] = runProcess.mock.calls[0]
    expect(opts.cmd).toBe('/opt/envs/openmm/bin/python')
    expect(opts.args[0]).toMatch(/scripts\/openmm\/polish\.py$/)
    expect(
      await fs.readJson(path.join(jobDir, 'polish', 'polished.json'))
    ).toEqual({
      [member('rg30', '0001')]: path.join(
        jobDir,
        'polish',
        'rg30_bioemu_rg30_0001.pdb'
      )
    })
    expect(updateStepStatus).toHaveBeenLastCalledWith(
      job,
      'polish',
      expect.objectContaining({
        status: 'Success',
        message: expect.stringContaining('Polished 1 of 2')
      })
    )
  })

  it('does not fail the job when polishing fails', async () => {
    runProcess.mockRejectedValue(new Error('Polish exited with code 1'))

    await expect(runPolish(job)).resolves.toBeUndefined()

    expect(updateStepStatus).toHaveBeenLastCalledWith(
      job,
      'polish',
      expect.objectContaining({
        status: 'Error',
        message: expect.stringContaining('ensembles are unpolished')
      })
    )
  })

  it('still lets a cancelled job stop', async () => {
    runProcess.mockRejectedValue(
      new ProcessError('Polish', 'python', {
        code: null,
        signal: 'SIGTERM',
        timedOut: false,
        aborted: true,
        stderrTail: []
      })
    )
    await expect(runPolish(job)).rejects.toThrow(/cancelled/)
  })

  it('reports a job with no ensembles', async () => {
    await fs.remove(path.join(jobDir, 'multifoxs'))
    await fs.ensureDir(path.join(jobDir, 'multifoxs'))

    await runPolish(job)

    expect(runProcess).not.toHaveBeenCalled()
    expect(updateStepStatus).toHaveBeenLastCalledWith(
      job,
      'polish',
      expect.objectContaining({ status: 'Error' })
    )
  })
})
