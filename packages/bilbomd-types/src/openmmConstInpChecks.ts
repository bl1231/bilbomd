import { parseConstInp } from './constInpParser.js'
import { joinConstInpLines } from './structureFileChecks.js'

// The 'cons fix' and 'shape desc … rigid' commands as parseConstInp reads them
const CONS_FIX = /cons\s+fix\s+sele\s+(.+)\s+end/
const SHAPE_RIGID = /shape\s+desc\s+\w+\s+rigid\s+sele\s+(.+)\s+end/
const DEFINE_NAME = /^define\s+(\S+)/i

// True when parseConstInp turns this define into a segment. Asking the parser
// itself keeps this check in step with what OpenMM is given.
const isReadableDefine = (line: string, name: string): boolean =>
  (parseConstInp(`${line}\ncons fix sele ${name} end`).fixed_bodies?.length ??
    0) > 0

/**
 * The commands of a const.inp that would be lost when it is converted to
 * OpenMM constraints (`parseConstInp`): defines in a form it doesn't read,
 * 'cons fix' / 'shape desc' names that no readable define above them sets,
 * and commands OpenMM doesn't apply at all, such as 'cons harm'. CHARMM reads
 * the file itself, so this only matters for OpenMM jobs.
 */
export const findOpenMMIgnoredConstInpLines = (text: string): string[] => {
  const ignored: string[] = []
  const readable = new Set<string>()

  const commands = joinConstInpLines(text)
    .map((line) => (line.split('!')[0] ?? '').trim())
    .filter(
      (line) => line && !line.startsWith('*') && line.toLowerCase() !== 'return'
    )

  for (const line of commands) {
    const define = line.match(DEFINE_NAME)
    if (define) {
      const name = define[1] as string
      if (isReadableDefine(line, name)) {
        readable.add(name)
      } else {
        readable.delete(name)
        ignored.push(line)
      }
      continue
    }

    const selection = (line.match(CONS_FIX) ?? line.match(SHAPE_RIGID))?.[1]
    if (selection === undefined) {
      ignored.push(line)
      continue
    }
    const missing = selection
      .split(/\s*\.or\.\s*/)
      .map((name) => name.trim())
      .filter((name) => !readable.has(name))
    if (missing.length > 0) {
      ignored.push(`${line} (${missing.join(', ')} not set by a define above)`)
    }
  }
  return ignored
}

const listed = (items: string[], max = 3): string => {
  const shown = items.slice(0, max).map((item) => `"${item}"`)
  const more = items.length - shown.length
  return shown.join('; ') + (more > 0 ? `; and ${more} more` : '')
}

/**
 * Why a const.inp can't be used for an OpenMM job, or null when OpenMM gets
 * every constraint in it.
 */
export const openmmConstInpMessage = (text: string): string | null => {
  const ignored = findOpenMMIgnoredConstInpLines(text)
  if (ignored.length > 0) {
    return (
      'OpenMM would ignore these lines, so the job would run with fewer ' +
      `constraints than the file asks for: ${listed(ignored)}. ` +
      'For OpenMM, each define must select one residue range on one segid, ' +
      'as in "define fixed1 sele ( resid 1:100 .and. segid PROA ) end", and ' +
      'only "cons fix" and "shape desc … rigid" are applied. The Inp Jiffy ' +
      'can rewrite a file in this form, or run the job with CHARMM.'
    )
  }
  return null
}
