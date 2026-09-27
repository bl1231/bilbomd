import path from 'node:path'
import { spawnProcess } from './runProcess.js'

export interface RunPythonOptions {
  pythonBin?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  killSignal?: NodeJS.Signals
}

// Runs `python <script> <config.yaml>`. Resolves with the exit code/signal
// rather than throwing on failure; callers inspect `code` themselves.
export const runPythonStep = async (
  scriptPath: string,
  configYamlPath: string,
  opts: RunPythonOptions = {}
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
  const {
    pythonBin = '/opt/envs/openmm/bin/python',
    cwd,
    env,
    timeoutMs,
    onStdoutLine,
    onStderrLine,
    killSignal
  } = opts

  const { code, signal } = await spawnProcess({
    label: path.basename(scriptPath),
    cmd: pythonBin,
    args: [scriptPath, configYamlPath],
    cwd,
    env,
    timeoutMs,
    killSignal,
    onStdoutLine,
    onStderrLine
  })

  return { code, signal }
}
