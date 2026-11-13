import { access, constants } from 'node:fs/promises'
import { logger } from '../../helpers/loggers.js'
import {
  spawnProcess,
  ProcessError,
  type SpawnProcessOptions
} from '../../helpers/runProcess.js'

// CHARMM prints thousands of lines; for a UI error message we only want the
// lines that actually describe the failure.
const isCharmmErrorLine = (line: string): boolean =>
  line.includes('***** ERROR') ||
  line.includes('ABNORMAL TERMINATION') ||
  line.trimStart().startsWith('?')

export const summarizeCharmmErrors = (lines: string[]): string => {
  const errorLines = lines
    .filter(isCharmmErrorLine)
    .map((line) => line.trim())
    .filter(Boolean)
  return errorLines.length > 0
    ? errorLines.join(' | ')
    : 'see CHARMM log for details'
}

export const defaultCharmmBin = (): string =>
  process.env.CHARMM ?? '/usr/local/bin/charmm'

// The published worker image has no CHARMM; only hosts that build
// bilbomd-worker-charmm.dockerfile can run CHARMM jobs. Check before a CHARMM
// pipeline starts, so the job fails with this instead of a spawn error halfway
// through the first CHARMM step.
export const assertCharmmAvailable = async (
  charmmBin: string = defaultCharmmBin()
): Promise<void> => {
  try {
    await access(charmmBin, constants.X_OK)
  } catch {
    throw new Error(
      `CHARMM is not installed on this BilboMD worker (${charmmBin}), so CHARMM jobs cannot run here. ` +
        'Submit the job as a PDB job with the OpenMM engine instead.'
    )
  }
}

interface RunCharmmOptions {
  charmmBin: string
  inputFile: string
  outputFile: string
  cwd: string
  timeoutMs: number
  heartbeat?: SpawnProcessOptions['heartbeat']
}

// Runs `charmm -o <outputFile> -i <inputFile>` and resolves with its console
// output. A failed run rejects with the CHARMM error lines (not the whole
// output); timeouts, cancellation and signals reject with a ProcessError.
export const runCharmm = async ({
  charmmBin,
  inputFile,
  outputFile,
  cwd,
  timeoutMs,
  heartbeat
}: RunCharmmOptions): Promise<string> => {
  const label = `CHARMM ${inputFile}`
  const output: string[] = []
  const result = await spawnProcess({
    label,
    cmd: charmmBin,
    args: ['-o', outputFile, '-i', inputFile],
    cwd,
    timeoutMs,
    heartbeat,
    onStdoutLine: (line) => output.push(line),
    onStderrLine: (line) => output.push(line)
  })

  if (result.code === 0) {
    logger.info(`CHARMM execution succeeded: ${inputFile}`)
    return output.join('\n')
  }

  // Log the full output for debugging, but keep the thrown message concise
  logger.error(
    `CHARMM execution failed: ${inputFile}, exit code: ${result.code}\n${output.join('\n')}`
  )
  if (result.timedOut || result.aborted || result.signal) {
    throw new ProcessError(label, charmmBin, result)
  }
  throw new Error(
    `CHARMM execution failed: ${inputFile}, exit code: ${result.code}. ${summarizeCharmmErrors(output)}`
  )
}
