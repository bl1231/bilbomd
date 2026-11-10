import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { MwCheckResponse } from '@bilbomd/bilbomd-types'

const execFileAsync = promisify(execFile)

const MW_CHECK_SCRIPT = '/app/scripts/mw_check.py'

// The Guinier scan is quadratic in the number of points; a 2 MB profile
// takes a few seconds. Anything longer than this is stuck.
const TIMEOUT_MS = 60_000

export type MwCheckModel = { kind: 'pdb' | 'psf' | 'entities'; file: string }

// Runs tools/python/mw_check.py in `dir`. The file names are ones this
// service chose; nothing from the request reaches the command line.
export const runMwCheck = async (
  dir: string,
  saxsFile: string,
  model: MwCheckModel
): Promise<MwCheckResponse> => {
  const { stdout } = await execFileAsync(
    'python',
    [MW_CHECK_SCRIPT, saxsFile, `--${model.kind}`, model.file],
    { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 1_000_000 }
  )
  const result = JSON.parse(stdout) as MwCheckResponse
  if (!result?.mw || !result?.finding) {
    throw new Error('mw_check.py returned an unexpected result')
  }
  return result
}
