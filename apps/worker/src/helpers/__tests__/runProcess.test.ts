import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  spawnProcess,
  runProcess,
  ProcessError,
  type SpawnProcessOptions
} from '../runProcess.js'

// These spawn real processes (the current Node binary running small inline
// scripts) rather than mocking child_process, since the point of the helper
// is how it behaves around real exits, signals and stdio.
const node = process.execPath

const js = (
  script: string,
  extra: Partial<SpawnProcessOptions> = {}
): SpawnProcessOptions => ({
  label: 'test',
  cmd: node,
  args: ['-e', script],
  ...extra
})

describe('spawnProcess', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-process-'))
  })

  afterEach(async () => {
    await fs.remove(dir)
  })

  it('resolves with the exit code without throwing', async () => {
    const result = await spawnProcess(js('process.exit(3)'))

    expect(result).toMatchObject({
      code: 3,
      signal: null,
      timedOut: false,
      aborted: false
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('writes stdout and stderr to files, fully flushed on resolve', async () => {
    const stdoutFile = path.join(dir, 'out.log')
    const stderrFile = path.join(dir, 'err.log')
    // ~1 MB of stdout to make sure we wait for the pipe to drain
    await spawnProcess(
      js(
        `process.stdout.write('x'.repeat(1024 * 1024)); process.stderr.write('oops\\n')`,
        { stdoutFile, stderrFile }
      )
    )

    expect((await fs.stat(stdoutFile)).size).toBe(1024 * 1024)
    expect(await fs.readFile(stderrFile, 'utf8')).toBe('oops\n')
  })

  it('does not block a child that floods stdout when nothing reads it', async () => {
    // With an unread stdout pipe the child would block once the ~64 KB pipe
    // buffer fills, and only the timeout would end it.
    const result = await spawnProcess(
      js(`process.stdout.write('x'.repeat(2 * 1024 * 1024))`, {
        timeoutMs: 10_000
      })
    )

    expect(result).toMatchObject({ code: 0, timedOut: false })
  })

  it('appends to existing log files when appendLogs is set', async () => {
    const stdoutFile = path.join(dir, 'out.log')
    await fs.writeFile(stdoutFile, 'previous run\n')

    await spawnProcess(
      js(`console.log('this run')`, { stdoutFile, appendLogs: true })
    )

    expect(await fs.readFile(stdoutFile, 'utf8')).toBe(
      'previous run\nthis run\n'
    )
  })

  it('truncates existing log files by default', async () => {
    const stdoutFile = path.join(dir, 'out.log')
    await fs.writeFile(stdoutFile, 'previous run\n')

    await spawnProcess(js(`console.log('this run')`, { stdoutFile }))

    expect(await fs.readFile(stdoutFile, 'utf8')).toBe('this run\n')
  })

  it('delivers stdout and stderr line by line, handling CRLF', async () => {
    const out: string[] = []
    const err: string[] = []
    await spawnProcess(
      js(`process.stdout.write('a\\r\\nb\\nleftover'); console.error('e1')`, {
        onStdoutLine: (l) => out.push(l),
        onStderrLine: (l) => err.push(l)
      })
    )

    expect(out).toEqual(['a', 'b', 'leftover'])
    expect(err).toEqual(['e1'])
  })

  it('keeps only the last N stderr lines', async () => {
    const result = await spawnProcess(
      js(`for (let i = 1; i <= 10; i++) console.error('line ' + i)`, {
        stderrTailLines: 3
      })
    )

    expect(result.stderrTail).toEqual(['line 8', 'line 9', 'line 10'])
  })

  it('passes cwd and merges env over process.env', async () => {
    const out: string[] = []
    await spawnProcess(
      js(
        `console.log(process.cwd()); console.log(process.env.BILBO_TEST); console.log(typeof process.env.PATH)`,
        {
          cwd: dir,
          env: { BILBO_TEST: 'hello' },
          onStdoutLine: (l) => out.push(l)
        }
      )
    )

    expect(out).toEqual([await fs.realpath(dir), 'hello', 'string'])
  })

  it('terminates the process on timeout', async () => {
    const result = await spawnProcess(
      js('setTimeout(() => {}, 60_000)', { timeoutMs: 100 })
    )

    expect(result.timedOut).toBe(true)
    expect(result.signal).toBe('SIGTERM')
    expect(result.durationMs).toBeLessThan(5000)
  })

  it('escalates to SIGKILL when the process ignores SIGTERM', async () => {
    // Abort only once the child reports its SIGTERM handler is installed, so
    // a slow process start can't make it die from the first signal.
    const controller = new AbortController()
    const result = await spawnProcess(
      js(
        `process.on('SIGTERM', () => {}); console.log('ready'); setTimeout(() => {}, 60_000)`,
        {
          abortSignal: controller.signal,
          killGraceMs: 200,
          onStdoutLine: (l) => l === 'ready' && controller.abort()
        }
      )
    )

    expect(result.aborted).toBe(true)
    expect(result.signal).toBe('SIGKILL')
  })

  it('terminates the process when the abort signal fires', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)

    const result = await spawnProcess(
      js('setTimeout(() => {}, 60_000)', { abortSignal: controller.signal })
    )

    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
    expect(result.signal).toBe('SIGTERM')
  })

  it('does not start the process if already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const out: string[] = []

    const result = await spawnProcess(
      js(`console.log('ran')`, {
        abortSignal: controller.signal,
        onStdoutLine: (l) => out.push(l)
      })
    )

    expect(result).toMatchObject({ aborted: true, code: null })
    expect(out).toEqual([])
  })

  it('calls the heartbeat while the process runs, then stops', async () => {
    const onBeat = vi.fn()
    await spawnProcess(
      js('setTimeout(() => {}, 350)', {
        heartbeat: { intervalMs: 100, onBeat }
      })
    )
    const beats = onBeat.mock.calls.length

    expect(beats).toBeGreaterThanOrEqual(2)
    expect(onBeat.mock.calls[0][0]).toBeGreaterThanOrEqual(90)
    await new Promise((r) => setTimeout(r, 250))
    expect(onBeat).toHaveBeenCalledTimes(beats)
  })

  it('rejects with a ProcessError when the binary does not exist', async () => {
    const stdoutFile = path.join(dir, 'out.log')
    const err = await spawnProcess({
      label: 'Ghost',
      cmd: path.join(dir, 'no-such-binary'),
      stdoutFile
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ProcessError)
    expect((err as ProcessError).message).toMatch(
      /^Ghost failed to start: .*ENOENT/
    )
    // log file is created and closed even though nothing ran
    expect(await fs.pathExists(stdoutFile)).toBe(true)
  })
})

describe('runProcess', () => {
  it('resolves on exit code 0', async () => {
    const result = await runProcess(js('process.exit(0)'))
    expect(result.code).toBe(0)
  })

  it('rejects with the exit code and stderr tail on failure', async () => {
    const err = await runProcess(
      js(
        `console.error('bad input'); console.error('giving up'); process.exit(2)`,
        {
          label: 'MultiFoXS'
        }
      )
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ProcessError)
    const pe = err as ProcessError
    expect(pe.message).toBe(
      'MultiFoXS exited with code 2\nbad input\ngiving up'
    )
    expect(pe.label).toBe('MultiFoXS')
    expect(pe.cmd).toBe(node)
    expect(pe.result.code).toBe(2)
  })

  it('describes timeouts', async () => {
    await expect(
      runProcess(
        js('setTimeout(() => {}, 60_000)', {
          label: 'CHARMM md',
          timeoutMs: 100
        })
      )
    ).rejects.toThrow(/^CHARMM md timed out after \d+s$/)
  })

  it('describes cancellation', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await expect(
      runProcess(
        js('setTimeout(() => {}, 60_000)', {
          label: 'FoXS',
          abortSignal: controller.signal
        })
      )
    ).rejects.toThrow(/^FoXS was cancelled$/)
  })

  it('describes processes killed by a signal', async () => {
    await expect(
      runProcess(
        js(`process.kill(process.pid, 'SIGKILL')`, { label: 'Pepsi-SANS' })
      )
    ).rejects.toThrow(/^Pepsi-SANS was killed by SIGKILL$/)
  })
})
