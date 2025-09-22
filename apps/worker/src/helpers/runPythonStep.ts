import { spawn } from 'node:child_process'
import { once } from 'node:events'
import readline from 'node:readline'

export interface RunPythonOptions {
  pythonBin?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  killSignal?: NodeJS.Signals | number
}

export async function runPythonStep(
  scriptPath: string,
  configYamlPath: string,
  opts: RunPythonOptions = {}
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const {
    pythonBin = '/opt/envs/openmm/bin/python',
    cwd,
    env,
    timeoutMs,
    onStdoutLine,
    onStderrLine,
    killSignal = 'SIGTERM'
  } = opts

  const child = spawn(pythonBin, [scriptPath, configYamlPath], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  // Handle spawn errors (e.g., ENOENT) so we don’t hang forever
  const errorP = once(child, 'error').then(([err]) => {
    throw err
  })

  // Robust line-reading (handles CRLF and backpressure)
  let rlOut: readline.Interface | undefined
  let rlErr: readline.Interface | undefined
  if (child.stdout) {
    rlOut = readline.createInterface({ input: child.stdout })
    rlOut.on('line', (line) => onStdoutLine?.(line.replace(/\r$/, '')))
  }
  if (child.stderr) {
    rlErr = readline.createInterface({ input: child.stderr })
    rlErr.on('line', (line) => onStderrLine?.(line.replace(/\r$/, '')))
  }

  // Timeout (track both timers)
  let termTimer: NodeJS.Timeout | undefined
  let killTimer: NodeJS.Timeout | undefined
  if (timeoutMs && timeoutMs > 0) {
    termTimer = setTimeout(() => {
      try {
        child.kill(killSignal)
      } catch {}
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 5000)
    }, timeoutMs)
  }

  // Prefer 'close' so all stdio is drained
  const closeP = once(child, 'close').then(([code, signal]) => ({ code, signal }))

  let result: { code: number | null; signal: NodeJS.Signals | null }
  try {
    result = await Promise.race([closeP, errorP])
  } finally {
    // Cleanup
    if (termTimer) clearTimeout(termTimer)
    if (killTimer) clearTimeout(killTimer)
    rlOut?.close()
    rlErr?.close()
  }

  return result
}
