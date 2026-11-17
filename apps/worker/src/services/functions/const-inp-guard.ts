import path from 'path'
import fs from 'fs-extra'
import {
  constInpLengthMessage,
  constraintsFromStored,
  findDisallowedConstInpLine,
  writeConstInp,
  type MDConstraintsDTO
} from '@bilbomd/bilbomd-types'

// The constraint file name goes into the CHARMM input as `STREAM ../../<name>`
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// Longest part of an offending line quoted back in the error
const MAX_QUOTED = 80

/**
 * Checks a job's constraint file right before CHARMM streams it. The backend
 * checks uploads too, but CHARMM runs whatever the file in the job dir says,
 * so the worker checks the file it is about to use, whatever path the job
 * took to the queue. Throws when the file name or any line isn't allowed, or
 * when a line is too long for CHARMM: the MD steps run with 'bomlev -2', so
 * CHARMM would skip the cut-short command and silently drop that constraint.
 *
 * For jobs whose constraints were validated from structured input (their
 * stored md_constraints carry segids), the file must also be exactly what
 * BilboMD writes for those constraints, so a file changed after submission is
 * caught. Older jobs and PAE-generated constraints get the line checks only.
 */
export const assertConstInpAllowed = async (
  jobDir: string,
  fileName: string,
  stored?: MDConstraintsDTO | null
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
  const tooLong = constInpLengthMessage(text)
  if (tooLong !== null) {
    throw new Error(`Constraint file ${fileName}: ${tooLong}`)
  }
  const constraints = constraintsFromStored(stored)
  if (constraints && text !== writeConstInp(constraints)) {
    throw new Error(
      `Constraint file ${fileName} does not match the job's constraints`
    )
  }
}
