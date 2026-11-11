import path from 'path'
import fs from 'fs-extra'
import { findDisallowedConstInpLine } from '@bilbomd/bilbomd-types'

// The constraint file name goes into the CHARMM input as `STREAM ../../<name>`
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// Longest part of an offending line quoted back in the error
const MAX_QUOTED = 80

/**
 * Checks a job's constraint file right before CHARMM streams it. The backend
 * checks uploads too, but CHARMM runs whatever the file in the job dir says,
 * so the worker checks the file it is about to use, whatever path the job
 * took to the queue. Throws when the file name or any line isn't allowed.
 */
export const assertConstInpAllowed = async (
  jobDir: string,
  fileName: string
): Promise<void> => {
  if (!SAFE_FILE_NAME.test(fileName)) {
    throw new Error(
      `Constraint file name not allowed: ${JSON.stringify(fileName)}`
    )
  }
  const text = await fs.readFile(path.join(jobDir, fileName), 'utf8')
  const line = findDisallowedConstInpLine(text)
  if (line !== null) {
    const quoted =
      line.length > MAX_QUOTED ? `${line.slice(0, MAX_QUOTED)}...` : line
    throw new Error(
      `Constraint file ${fileName} has a line BilboMD does not allow: "${quoted}"`
    )
  }
}
