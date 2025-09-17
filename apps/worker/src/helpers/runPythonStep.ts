// src/lib/runPythonStep.ts
import { spawn } from 'node:child_process'
import { once } from 'node:events'

export interface RunPythonOptions {
  pythonBin?: string // default: '/opt/envs/openmm/bin/python'
  cwd?: string // working dir for the step
  env?: NodeJS.ProcessEnv // extra env (merged on top of process.env)
  timeoutMs?: number // hard timeout
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  killSignal?: NodeJS.Signals | number // default: 'SIGTERM'
}

export async function runPythonStep(
  scriptPath: string,
  configYamlPath: string,
  opts: RunPythonOptions = {}
): Promise<{ code: number; signal: NodeJS.Signals | null }> {
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

  // Line-buffered streaming
  let stdoutBuf = ''
  let stderrBuf = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  child.stdout.on('data', (chunk: string) => {
    stdoutBuf += chunk
    let idx
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx)
      stdoutBuf = stdoutBuf.slice(idx + 1)
      onStdoutLine?.(line)
    }
  })

  child.stderr.on('data', (chunk: string) => {
    stderrBuf += chunk
    let idx
    while ((idx = stderrBuf.indexOf('\n')) !== -1) {
      const line = stderrBuf.slice(0, idx)
      stderrBuf = stderrBuf.slice(idx + 1)
      onStderrLine?.(line)
    }
  })

  // Timeout guard
  let timeoutHandle: NodeJS.Timeout | undefined
  if (timeoutMs && timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      child.kill(killSignal)
      // escalate if it hangs
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }, timeoutMs)
  }

  const [code, signal] = (await once(child, 'exit')) as [number, NodeJS.Signals | null]

  if (timeoutHandle) clearTimeout(timeoutHandle)

  // Flush any remainder without newline
  if (stdoutBuf) onStdoutLine?.(stdoutBuf)
  if (stderrBuf) onStderrLine?.(stderrBuf)

  return { code, signal }
}
