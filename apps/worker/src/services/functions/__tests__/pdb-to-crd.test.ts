import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job as BullMQJob } from 'bullmq'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

const { runProcessMock, spawnProcessMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  spawnProcessMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../helpers/runProcess.js')
  >('../../../helpers/runProcess.js')
  return {
    ...actual,
    runProcess: runProcessMock,
    spawnProcess: spawnProcessMock
  }
})

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  runPrepPdb,
  runStripCofactors,
  runCifToPdb,
  createPdb2CrdCharmmInpFiles,
  spawnPdb2CrdCharmm
} from '../pdb-to-crd.js'
import { ProcessError } from '../../../helpers/runProcess.js'
import { logger } from '../../../helpers/loggers.js'
import { config } from '../../../config/config.js'

const lastOpts = (mock: ReturnType<typeof vi.fn>): SpawnProcessOptions =>
  mock.mock.calls.at(-1)?.[0]

const cleanExit = {
  code: 0,
  signal: null,
  timedOut: false,
  aborted: false,
  durationMs: 1,
  stderrTail: []
}

describe('pdb-to-crd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue(cleanExit)
  })

  describe.each([
    {
      name: 'runPrepPdb',
      run: () => runPrepPdb({ uuid: 'u1', pdb_file: 'input.pdb' }),
      script: '/app/scripts/prep_pdb.py',
      logName: 'prep_pdb'
    },
    {
      name: 'runStripCofactors',
      run: () => runStripCofactors({ uuid: 'u1', pdb_file: 'input.pdb' }),
      script: '/app/scripts/strip_cofactors.py',
      logName: 'strip_cofactors'
    },
    {
      name: 'runCifToPdb',
      run: () => runCifToPdb({ uuid: 'u1', pdb_file: 'structure.cif' }),
      script: '/app/scripts/cif_to_pdb.py',
      logName: 'cif_to_pdb'
    }
  ])('$name', ({ run, script, logName }) => {
    it('runs the script in the job dir with its own log files', async () => {
      await run()

      const opts = lastOpts(runProcessMock)
      expect(opts).toMatchObject({
        label: script.split('/').pop(),
        cmd: '/opt/envs/base/bin/python',
        cwd: expect.stringMatching(/\/u1$/),
        stdoutFile: expect.stringMatching(new RegExp(`/u1/${logName}\\.log$`)),
        stderrFile: expect.stringMatching(
          new RegExp(`/u1/${logName}_error\\.log$`)
        ),
        timeoutMs: config.processTimeouts.helperScriptMs
      })
      expect(opts.args?.[0]).toBe(script)
    })

    it('logs stderr lines as errors', async () => {
      await run()
      lastOpts(runProcessMock).onStderrLine?.('some warning')

      expect(vi.mocked(logger).error).toHaveBeenCalledWith(
        expect.stringContaining('some warning')
      )
    })

    it('propagates script failures', async () => {
      runProcessMock.mockRejectedValue(new Error('exited with code 1'))
      await expect(run()).rejects.toThrow('exited with code 1')
    })
  })

  describe('runCifToPdb', () => {
    it('resolves with the output PDB filename and passes both paths', async () => {
      const result = await runCifToPdb({
        uuid: 'u1',
        pdb_file: 'structure.cif'
      })

      expect(result).toBe('structure.pdb')
      expect(lastOpts(runProcessMock).args).toEqual([
        '/app/scripts/cif_to_pdb.py',
        expect.stringMatching(/\/u1\/structure\.cif$/),
        expect.stringMatching(/\/u1\/structure\.pdb$/)
      ])
    })
  })

  describe('createPdb2CrdCharmmInpFiles', () => {
    it('returns the non-empty lines pdb2crd.py prints to stdout', async () => {
      runProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
        for (const line of ['a.inp', '', '  b.inp  ', 'c.inp']) {
          opts.onStdoutLine?.(line)
        }
        return cleanExit
      })

      const files = await createPdb2CrdCharmmInpFiles({
        uuid: 'u1',
        pdb_file: 'in.pdb'
      })

      expect(files).toEqual(['a.inp', 'b.inp', 'c.inp'])
      expect(lastOpts(runProcessMock)).toMatchObject({
        label: 'pdb2crd.py',
        stdoutFile: expect.stringMatching(/pdb2crd-python\.log$/)
      })
    })
  })

  describe('spawnPdb2CrdCharmm', () => {
    const makeMQJob = () =>
      ({ data: { uuid: 'u1' }, log: vi.fn() }) as unknown as BullMQJob

    it('runs CHARMM once per input file with the setup timeout', async () => {
      spawnProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
        opts.onStdoutLine?.(`done ${opts.args?.[3]}`)
        return cleanExit
      })
      const mqJob = makeMQJob()

      const outputs = await spawnPdb2CrdCharmm(mqJob, [
        'seg_a.inp',
        'seg_b.inp'
      ])

      expect(outputs).toEqual(['done seg_a.inp', 'done seg_b.inp'])
      expect(spawnProcessMock).toHaveBeenCalledTimes(2)
      expect(spawnProcessMock.mock.calls[0][0]).toMatchObject({
        args: ['-o', 'seg_a.log', '-i', 'seg_a.inp'],
        cwd: expect.stringMatching(/\/u1$/),
        timeoutMs: config.processTimeouts.charmmSetupMs
      })
      expect(mqJob.log).toHaveBeenCalledWith('pdb2crd done with seg_a.inp')
    })

    it('summarizes CHARMM error lines when a run fails', async () => {
      spawnProcessMock.mockImplementation(async (opts: SpawnProcessOptions) => {
        opts.onStdoutLine?.('lots of normal output')
        opts.onStdoutLine?.('  ***** ERROR in PSF generation')
        opts.onStderrLine?.(' ABNORMAL TERMINATION')
        return { ...cleanExit, code: 1 }
      })

      await expect(
        spawnPdb2CrdCharmm(makeMQJob(), ['seg_a.inp'])
      ).rejects.toThrow(
        'CHARMM execution failed: seg_a.inp, exit code: 1. ***** ERROR in PSF generation | ABNORMAL TERMINATION'
      )
    })

    it('reports timeouts as a ProcessError', async () => {
      spawnProcessMock.mockResolvedValue({
        ...cleanExit,
        code: null,
        signal: 'SIGTERM',
        timedOut: true,
        durationMs: 3_600_000
      })

      const err = await spawnPdb2CrdCharmm(makeMQJob(), ['seg_a.inp']).catch(
        (e: unknown) => e
      )

      expect(err).toBeInstanceOf(ProcessError)
      expect((err as Error).message).toBe(
        'CHARMM seg_a.inp timed out after 3600s'
      )
    })
  })
})
