import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { finished } from 'node:stream/promises'
import readline from 'node:readline'
import type { Readable } from 'node:stream'

export interface SpawnProcessOptions {
  // Human-readable name used in errors, e.g. 'MultiFoXS' or 'CHARMM heat'
  label: string
  cmd: string
  args?: string[]
  cwd?: string
  // Merged over process.env
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  // Aborting kills the process the same way a timeout does
  abortSignal?: AbortSignal
  // First signal sent on timeout/abort; SIGKILL follows after killGraceMs
  killSignal?: NodeJS.Signals
  killGraceMs?: number
  // Raw output is written here; files are fully flushed before the promise settles
  stdoutFile?: string
  stderrFile?: string
  // Append to existing log files instead of truncating them
  appendLogs?: boolean
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  heartbeat?: {
    intervalMs: number
    onBeat: (elapsedMs: number) => void
  }
  // How many trailing stderr lines to keep for error reporting
  stderrTailLines?: number
}

export interface ProcessResult {
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  aborted: boolean
  durationMs: number
  stderrTail: string[]
}

type ProcessFailure = Omit<ProcessResult, 'durationMs'> & {
  durationMs?: number
}

const describeFailure = (label: string, r: ProcessFailure): string => {
  if (r.timedOut)
    return `${label} timed out after ${Math.round((r.durationMs ?? 0) / 1000)}s`
  if (r.aborted) return `${label} was cancelled`
  if (r.signal) return `${label} was killed by ${r.signal}`
  return `${label} exited with code ${r.code}`
}

export class ProcessError extends Error {
  readonly label: string
  readonly cmd: string
  readonly result: ProcessFailure

  constructor(
    label: string,
    cmd: string,
    result: ProcessFailure,
    options?: { cause?: unknown }
  ) {
    const tail = result.stderrTail.slice(-10).join('\n')
    // A cause means the process never started (e.g. ENOENT)
    const headline =
      options?.cause instanceof Error
        ? `${label} failed to start: ${options.cause.message}`
        : describeFailure(label, result)
    super(`${headline}${tail ? `\n${tail}` : ''}`, options)
    this.name = 'ProcessError'
    this.label = label
    this.cmd = cmd
    this.result = result
  }
}

const readLines = (
  stream: Readable | null,
  onLine: (line: string) => void
): readline.Interface | undefined => {
  if (!stream) return undefined
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  rl.on('line', (line) => onLine(line.replace(/\r$/, '')))
  return rl
}

const openLog = (
  file: string | undefined,
  append: boolean
): fs.WriteStream | undefined =>
  file ? fs.createWriteStream(file, { flags: append ? 'a' : 'w' }) : undefined

// Spawns a process and resolves once it has exited and all output is
// flushed, whatever the exit code. Rejects only if the process could not be
// started (e.g. ENOENT). Use runProcess() to treat non-zero exits as errors.
export const spawnProcess = async (
  opts: SpawnProcessOptions
): Promise<ProcessResult> => {
  const {
    label,
    cmd,
    args = [],
    cwd,
    env,
    timeoutMs,
    abortSignal,
    killSignal = 'SIGTERM',
    killGraceMs = 5000,
    stdoutFile,
    stderrFile,
    appendLogs = false,
    onStdoutLine,
    onStderrLine,
    heartbeat,
    stderrTailLines = 50
  } = opts

  if (abortSignal?.aborted) {
    return {
      code: null,
      signal: null,
      timedOut: false,
      aborted: true,
      durationMs: 0,
      stderrTail: []
    }
  }

  const startedAt = Date.now()
  const stdoutLog = openLog(stdoutFile, appendLogs)
  const stderrLog = openLog(stderrFile, appendLogs)
  const stderrTail: string[] = []
  let timedOut = false
  let aborted = false

  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    // An unread pipe fills up (~64 KB) and blocks the child forever, so only
    // pipe stdout when something consumes it. stderr is always read for the
    // error tail.
    stdio: ['ignore', stdoutLog || onStdoutLine ? 'pipe' : 'ignore', 'pipe']
  })

  if (stdoutLog) child.stdout?.pipe(stdoutLog)
  if (stderrLog) child.stderr?.pipe(stderrLog)

  const rlOut = onStdoutLine ? readLines(child.stdout, onStdoutLine) : undefined
  const rlErr = readLines(child.stderr, (line) => {
    stderrTail.push(line)
    if (stderrTail.length > stderrTailLines) stderrTail.shift()
    onStderrLine?.(line)
  })

  let killTimer: NodeJS.Timeout | undefined
  const terminate = () => {
    try {
      child.kill(killSignal)
    } catch {
      // already gone
    }
    killTimer ??= setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }, killGraceMs)
  }

  const timeoutTimer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          terminate()
        }, timeoutMs)
      : undefined

  const onAbort = () => {
    aborted = true
    terminate()
  }
  abortSignal?.addEventListener('abort', onAbort, { once: true })

  const heartbeatTimer = heartbeat
    ? setInterval(
        () => heartbeat.onBeat(Date.now() - startedAt),
        heartbeat.intervalMs
      )
    : undefined

  const cleanup = async () => {
    clearTimeout(timeoutTimer)
    clearTimeout(killTimer)
    clearInterval(heartbeatTimer)
    abortSignal?.removeEventListener('abort', onAbort)
    rlOut?.close()
    rlErr?.close()
    // pipe() ends the log streams when the child's stdio closes; if the
    // process never started, end them ourselves.
    for (const log of [stdoutLog, stderrLog]) {
      if (!log) continue
      if (!log.writableEnded) log.end()
      await finished(log).catch(() => undefined)
    }
  }

  // 'close' (not 'exit') fires after stdio is drained. A spawn failure fires
  // 'error' and may also fire 'close', so settle only once.
  return new Promise<ProcessResult>((resolve, reject) => {
    let settled = false

    child.once('error', (err) => {
      if (settled) return
      settled = true
      void cleanup().finally(() =>
        reject(
          new ProcessError(
            label,
            cmd,
            {
              code: null,
              signal: null,
              timedOut,
              aborted,
              stderrTail
            },
            { cause: err }
          )
        )
      )
    })

    child.once(
      'close',
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return
        settled = true
        void cleanup().finally(() =>
          resolve({
            code,
            signal,
            timedOut,
            aborted,
            durationMs: Date.now() - startedAt,
            stderrTail
          })
        )
      }
    )
  })
}

// Like spawnProcess(), but resolves only on a clean exit (code 0). Timeouts,
// cancellation, signals and non-zero exits reject with a ProcessError that
// carries the last lines of stderr.
export const runProcess = async (
  opts: SpawnProcessOptions
): Promise<ProcessResult> => {
  const result = await spawnProcess(opts)
  if (result.code !== 0 || result.timedOut || result.aborted) {
    throw new ProcessError(opts.label, opts.cmd, result)
  }
  return result
}
