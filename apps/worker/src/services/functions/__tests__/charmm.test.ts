import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

const { spawnProcessMock } = vi.hoisted(() => ({ spawnProcessMock: vi.fn() }))

vi.mock('../../../helpers/runProcess.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../helpers/runProcess.js')
  >('../../../helpers/runProcess.js')
  return { ...actual, spawnProcess: spawnProcessMock }
})

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { summarizeCharmmErrors, runCharmm } from '../charmm.js'
import { ProcessError } from '../../../helpers/runProcess.js'

const cleanExit = {
  code: 0,
  signal: null,
  timedOut: false,
  aborted: false,
  durationMs: 1,
  stderrTail: []
}

describe('summarizeCharmmErrors', () => {
  it('keeps only CHARMM error lines, trimmed and joined', () => {
    expect(
      summarizeCharmmErrors([
        ' CHARMM>    read psf card',
        '  ***** ERROR in ATOM SELECTION',
        '      ? unrecognized command',
        ' normal output',
        ' ABNORMAL TERMINATION'
      ])
    ).toBe(
      '***** ERROR in ATOM SELECTION | ? unrecognized command | ABNORMAL TERMINATION'
    )
  })

  it('falls back to a pointer to the log when no error lines are found', () => {
    expect(summarizeCharmmErrors(['just output', ''])).toBe(
      'see CHARMM log for details'
    )
  })
})

describe('runCharmm', () => {
  const opts = {
    charmmBin: '/usr/local/bin/charmm',
    inputFile: 'heat.inp',
    outputFile: 'heat.out',
    cwd: '/jobs/u1',
    timeoutMs: 1000
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs charmm -o <out> -i <inp> and resolves with its output', async () => {
    spawnProcessMock.mockImplementation(async (o: SpawnProcessOptions) => {
      o.onStdoutLine?.('line 1')
      o.onStderrLine?.('line 2')
      return cleanExit
    })

    await expect(runCharmm(opts)).resolves.toBe('line 1\nline 2')
    expect(spawnProcessMock.mock.calls[0][0]).toMatchObject({
      label: 'CHARMM heat.inp',
      cmd: '/usr/local/bin/charmm',
      args: ['-o', 'heat.out', '-i', 'heat.inp'],
      cwd: '/jobs/u1',
      timeoutMs: 1000
    })
  })

  it('passes the heartbeat through', async () => {
    spawnProcessMock.mockResolvedValue(cleanExit)
    const heartbeat = { intervalMs: 10_000, onBeat: vi.fn() }

    await runCharmm({ ...opts, heartbeat })

    expect(spawnProcessMock.mock.calls[0][0].heartbeat).toBe(heartbeat)
  })

  it('rejects with only the CHARMM error lines on a non-zero exit', async () => {
    spawnProcessMock.mockImplementation(async (o: SpawnProcessOptions) => {
      o.onStdoutLine?.('thousands of normal lines')
      o.onStdoutLine?.(' ***** ERROR bad selection')
      return { ...cleanExit, code: 1 }
    })

    await expect(runCharmm(opts)).rejects.toThrow(
      /^CHARMM execution failed: heat.inp, exit code: 1. \*\*\*\*\* ERROR bad selection$/
    )
  })

  it('rejects with a ProcessError on timeout', async () => {
    spawnProcessMock.mockResolvedValue({
      ...cleanExit,
      code: null,
      signal: 'SIGTERM',
      timedOut: true,
      durationMs: 21_600_000
    })

    const err = await runCharmm(opts).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProcessError)
    expect((err as Error).message).toBe(
      'CHARMM heat.inp timed out after 21600s'
    )
  })
})
