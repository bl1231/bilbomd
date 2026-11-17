import {
  constInpLengthMessage,
  findDisallowedConstInpLine,
  wrapConstInpCommand
} from '../structureFileChecks.js'
import type { ConstraintSegment, Constraints } from './types.js'
import {
  MAX_RESIDUE_NUMBER,
  MAX_RIGID_BODIES,
  SEGID_PATTERN
} from './validate.js'

const assertSegment = (segment: ConstraintSegment): void => {
  const { segid, residues } = segment
  if (!SEGID_PATTERN.test(segid)) {
    throw new Error(
      `Refusing to write const.inp: bad segid ${JSON.stringify(segid)}`
    )
  }
  if (
    !Number.isInteger(residues.start) ||
    !Number.isInteger(residues.stop) ||
    residues.start < 0 ||
    residues.stop > MAX_RESIDUE_NUMBER ||
    residues.start > residues.stop
  ) {
    throw new Error(
      `Refusing to write const.inp: bad residue range for segment ${segid}`
    )
  }
}

const selection = (segment: ConstraintSegment): string =>
  segment.whole_segment
    ? `( segid ${segment.segid} )`
    : `( resid ${segment.residues.start}:${segment.residues.stop} .and. segid ${segment.segid} )`

/**
 * The CHARMM constraint file for validated constraints. This is the only
 * const.inp CHARMM is given for jobs with uploaded structures: users send
 * structured constraints, never CHARMM text.
 *
 * The fixed body's segments become fixed1, fixed2, … under one `cons fix`;
 * each rigid body becomes rigidN defines under its own `shape desc dockN
 * rigid`. Only segids and whole numbers from the constraints reach the file,
 * and both are checked again here, so a caller that skipped validation gets
 * an error instead of a file. As a last check the result must pass the same
 * command and line-length checks the worker runs before CHARMM reads it.
 */
export const writeConstInp = (constraints: Constraints): string => {
  const [fixed, ...extraFixed] = constraints.fixed_bodies
  if (!fixed || extraFixed.length > 0) {
    throw new Error('Refusing to write const.inp: need exactly one fixed body')
  }
  if (constraints.rigid_bodies.length > MAX_RIGID_BODIES) {
    throw new Error(
      `Refusing to write const.inp: more than ${MAX_RIGID_BODIES} rigid bodies`
    )
  }
  const bodies = [fixed, ...constraints.rigid_bodies]
  for (const body of bodies) {
    if (body.segments.length === 0) {
      throw new Error(
        `Refusing to write const.inp: ${body.name} has no segments`
      )
    }
    body.segments.forEach(assertSegment)
  }

  const lines: string[] = ['* Constraints written by BilboMD', '*']
  const push = (command: string) => lines.push(...wrapConstInpCommand(command))

  const fixedNames = fixed.segments.map((segment, i) => {
    const name = `fixed${i + 1}`
    push(`define ${name} sele ${selection(segment)} end`)
    return name
  })
  push(`cons fix sele ${fixedNames.join(' .or. ')} end`)

  let rigidCount = 0
  constraints.rigid_bodies.forEach((body, i) => {
    lines.push('')
    const names = body.segments.map((segment) => {
      const name = `rigid${++rigidCount}`
      push(`define ${name} sele ${selection(segment)} end`)
      return name
    })
    push(`shape desc dock${i + 1} rigid sele ${names.join(' .or. ')} end`)
  })

  lines.push('', 'return', '')
  const text = lines.join('\n')

  const problem =
    findDisallowedConstInpLine(text) ?? constInpLengthMessage(text)
  if (problem !== null) {
    throw new Error(
      `Refusing to write const.inp: failed its own check (${problem})`
    )
  }
  return text
}
