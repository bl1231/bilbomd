import {
  SUPPORTED_PDB_RESIDUES,
  PROTEIN_RESIDUES,
  DNA_RESIDUES,
  RNA_RESIDUES,
  CARBOHYDRATE_RESIDUES,
  GAFF_COFACTORS,
  METAL_COFACTORS
} from './pdbResidues.js'

// Checks on the text of uploaded structure and constraint files. The job forms
// and the backend both run them, each reading the file its own way, so a file
// gets the same answer in the browser as on upload.

const isAtomRecord = (line: string) =>
  line.startsWith('ATOM') || line.startsWith('HETATM')

/** True when one of the first five lines names CHARMM-GUI as the source. */
export const isFromCharmmGui = (text: string): boolean =>
  text
    .split(/[\r\n]+/)
    .slice(0, 5)
    .some((line) => line.includes('CHARMM-GUI'))

/**
 * True for a CHARMM coordinate file: a title of two to six '*' lines followed
 * by the atom count and the EXT format keyword.
 */
export const isCrdText = (text: string): boolean => {
  const lines = text.split(/[\r\n]+/)
  const titleLines = lines.findIndex((line) => !line.startsWith('*'))
  return (
    titleLines >= 2 &&
    titleLines <= 6 &&
    /^\s+\d+\s+EXT$/.test(lines[titleLines] ?? '')
  )
}

const PSF_ATOM_LINE =
  /^\s*\d+\s+[A-Z]{4}\s+\d+\s+[A-Z]{3,}\s+[a-zA-Z0-9_']+\s+[a-zA-Z0-9_']+\s+-?\d+\.\d+(?:[eE][+-]?\d+)?\s+\d+\.\d+(?:[eE][+-]?\d+)?\s+\d+/

/**
 * True for a CHARMM PSF file: a PSF header, a !NTITLE section, and exactly
 * the number of atom lines its !NATOM line announces.
 */
export const isPsfText = (text: string): boolean => {
  const lines = text.split(/[\r\n]+/)
  if (!lines[0]?.includes('PSF')) return false
  if (!lines.some((line) => line.trim().endsWith('!NTITLE'))) return false

  const natomLine = lines.findIndex((line) => /\d+\s+!NATOM/.test(line))
  const natomMatch = lines[natomLine]?.match(/(\d+)\s+!NATOM/)
  if (!natomMatch) return false
  const natom = parseInt(natomMatch[1] ?? '', 10)
  if (isNaN(natom)) return false

  const atomLines = lines.slice(natomLine + 1, natomLine + 1 + natom)
  return (
    atomLines.length === natom &&
    atomLines.every((line) => PSF_ATOM_LINE.test(line))
  )
}

/** True when some ATOM/HETATM record has a chain ID letter in column 22. */
export const pdbContainsChainId = (text: string): boolean =>
  text
    .split('\n')
    .some((line) => isAtomRecord(line) && /^[A-Za-z]$/.test(line[21] ?? ''))

/**
 * NMR entries ship every model of the ensemble in one file. The pipelines
 * expect one structure (KGSrna, for one, fails on the repeated atoms), so
 * more than one MODEL record fails.
 */
export const pdbIsSingleModel = (text: string): boolean => {
  let models = 0
  for (const line of text.split(/\r?\n/)) {
    if (/^MODEL(\s|$)/.test(line) && ++models > 1) return false
  }
  return true
}

/** Residue names BilboMD cannot process, sorted. Blank names are skipped. */
export const findUnsupportedPdbResidues = (text: string): string[] => {
  const unsupported = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    if (!isAtomRecord(line)) continue
    const residue = line.slice(17, 20).trim()
    if (residue && !SUPPORTED_PDB_RESIDUES.has(residue))
      unsupported.add(residue)
  }
  return [...unsupported].sort()
}

/**
 * The residue names in `unsupported` that are supported residues written in
 * lower or mixed case, such as 'ala' or 'Gly'. The PDB format uses uppercase
 * names and the MD steps match them exactly, so these are rejected too, but
 * the fix is to uppercase them rather than to add a new residue.
 */
export const findLowercaseResidueNames = (unsupported: string[]): string[] =>
  unsupported.filter(
    (name) =>
      name !== name.toUpperCase() &&
      SUPPORTED_PDB_RESIDUES.has(name.toUpperCase())
  )

/** Message for residue names that only need uppercasing. */
export const residueCaseMessage = (names: string[]): string =>
  `Residue names must be uppercase (found: ${names.join(', ')}). Change them to uppercase, for example ${names[0]} to ${names[0]?.toUpperCase()}.`

// Residues that stay in the model. Waters and ions are stripped before MD, so
// how they are numbered does not matter.
const MODELLED_RESIDUES = new Set<string>([
  ...PROTEIN_RESIDUES,
  ...DNA_RESIDUES,
  ...RNA_RESIDUES,
  ...CARBOHYDRATE_RESIDUES,
  ...GAFF_COFACTORS,
  ...METAL_COFACTORS
])

/**
 * A residue is identified by chain + number + insertion code, and constraints
 * select residues by chain and number. Two residues sharing all three (e.g. a
 * glycan numbered inside the protein's range) cannot be told apart: the GLYCAM
 * renaming merges them and minimization fails on the leftover sugar.
 *
 * Returns one description per shared number, e.g.
 * "chain A residue 12 (ASN and NAG)".
 */
export const findSharedResidueNumbers = (text: string): string[] => {
  const namesByResidue = new Map<string, Set<string>>()
  for (const line of text.split(/\r?\n/)) {
    // Later models repeat the first one
    if (line.startsWith('ENDMDL')) break
    if (!isAtomRecord(line)) continue
    // Alternate conformers may legitimately differ in residue name
    const altLoc = line[16] ?? ' '
    if (altLoc !== ' ' && altLoc !== 'A') continue
    const residue = line.slice(17, 20).trim()
    if (!MODELLED_RESIDUES.has(residue)) continue
    const chain = line[21] ?? ' '
    const number = line.slice(22, 27).trim()
    // CHARMM-written files give every segment the same chain letter and tell
    // residues apart by segment ID (columns 73-76)
    const segid = line.slice(72, 76).trim()
    const key = `chain ${chain} residue ${number}${segid ? ` (segment ${segid})` : ''}`
    const names = namesByResidue.get(key) ?? new Set<string>()
    names.add(residue)
    namesByResidue.set(key, names)
  }
  return [...namesByResidue]
    .filter(([, names]) => names.size > 1)
    .map(([key, names]) => `${key} (${[...names].join(' and ')})`)
}

/** Message for the residues findSharedResidueNumbers found; lists three. */
export const sharedResidueNumbersMessage = (shared: string[]): string => {
  const shown = shared.slice(0, 3).join(', ')
  const more = shared.length > 3 ? ` and ${shared.length - 3} more` : ''
  return `PDB has residues that share a chain and residue number: ${shown}${more}. Give each residue its own number within its chain (for example, number sugars and ligands after the last protein residue).`
}

/** Scoper takes plain RNA: A, C, G and U residues, no HETATM records. */
export const checkRnaResidues = (
  text: string
): { valid: boolean; message?: string } => {
  const nucleotides = new Set(['A', 'C', 'G', 'U'])
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('HETATM')) {
      return {
        valid: false,
        message: 'File contains HETATM lines which are not allowed.'
      }
    }
    if (line.startsWith('ATOM')) {
      const residue = line.split(/\s+/)[3] ?? ''
      if (residue.length !== 1 || !nucleotides.has(residue)) {
        return {
          valid: false,
          message: `Invalid residue name '${residue}'. Expected A, C, G, U.`
        }
      }
    }
  }
  return { valid: true }
}

/**
 * Line prefixes allowed in a CHARMM constraint (const.inp) file. The worker
 * STREAMs the file into CHARMM, so anything else (system, open, read, ...) is
 * rejected.
 */
export const CONST_INP_ALLOWED_PREFIXES = [
  'define',
  'cons fix',
  'cons harm',
  'shape desc',
  'return',
  '!',
  '*'
] as const

/**
 * Most shape commands a constraint file may hold: CHARMM's MAXSHP limit
 * (https://academiccharmm.org/documentation/version/c51b1/shapes).
 */
export const MAX_CONST_INP_SHAPE_COMMANDS = 20

/**
 * Longest line CHARMM reads in full. Measured with the worker's CHARMM (c49b2):
 * 200 characters work, 201 break the command. Trailing spaces don't count.
 */
export const MAX_CONST_INP_LINE_LENGTH = 200

/**
 * Longest command CHARMM accepts once '-' continuation lines are joined.
 * Measured with the worker's CHARMM (c49b2): 5000 characters work, 5025 are
 * truncated ("Command line too long").
 */
export const MAX_CONST_INP_COMMAND_LENGTH = 5000

/**
 * Width the constraint file writers wrap commands at, well under
 * MAX_CONST_INP_LINE_LENGTH.
 */
export const CONST_INP_WRAP_WIDTH = 77

// CHARMM reads a file one record per line; split on any line ending so a
// bare carriage return can't hide a second line from the checks below
const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/)

// A '-' at the end of a line's code (the part before any '!' comment),
// followed by nothing but spaces
const CONTINUATION = /- *$/

/**
 * Joins CHARMM continuation lines, so each entry is one command as CHARMM runs
 * it. CHARMM continues a command on the next line when the code before any '!'
 * comment ends in '-' (trailing spaces allowed), and joins the very next line
 * with no space added, even a blank one. It does not continue after a tab, a
 * '-' inside a comment, or a title ('*') line, and it runs the next line as a
 * command of its own. These checks guard what CHARMM runs, so lines are joined
 * only where CHARMM was seen to join them (c49b2); anything else stays a
 * separate entry and is checked on its own.
 */
export const joinConstInpLines = (text: string): string[] => {
  const commands: string[] = []
  let pending: string | null = null
  for (const line of splitLines(text)) {
    const command: string = (pending ?? '') + line
    const code: string = command.split('!')[0] ?? ''
    if (!command.trimStart().startsWith('*') && CONTINUATION.test(code)) {
      pending = code.replace(CONTINUATION, '')
      continue
    }
    commands.push(command)
    pending = null
  }
  if (pending !== null) commands.push(pending)
  return commands
}

/**
 * Splits one CHARMM command into lines of at most `width` characters, each but
 * the last ending in ' -' so CHARMM reads them as one command. Breaks only at
 * spaces; a single word longer than `width` gets a line of its own.
 */
export const wrapConstInpCommand = (
  command: string,
  width: number = CONST_INP_WRAP_WIDTH
): string[] => {
  const lines: string[] = []
  let current = ''
  for (const word of command.trim().split(/ +/)) {
    if (current !== '' && current.length + 1 + word.length + 2 > width) {
      lines.push(`${current} -`)
      current = word
    } else {
      current = current === '' ? word : `${current} ${word}`
    }
  }
  lines.push(current)
  return lines
}

/**
 * Rewraps each line of a constraint file that is longer than `width` at word
 * boundaries, ending every new line but the last in ' -', so CHARMM still
 * joins them into the same command. A line that already ends in '-' keeps it
 * on its last piece, so a continuation stays a continuation; nothing else is
 * added. Lines that fit, comment and title lines, and lines with a tab, an
 * inline comment or a carriage return are left as they are (the length checks
 * already limit them to what CHARMM reads).
 */
export const wrapLongConstInpLines = (
  text: string,
  width: number = CONST_INP_WRAP_WIDTH
): string =>
  text
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      if (
        line.length <= width ||
        trimmed.startsWith('*') ||
        /[\t!\r]/.test(line)
      ) {
        return [line]
      }
      return wrapConstInpCommand(line, width)
    })
    .join('\n')

/**
 * Why a constraint file has a line or command too long for CHARMM, or null
 * when every one fits. CHARMM cuts an over-long line short, and the MD steps
 * run with 'bomlev -2', so the broken command is skipped with only a warning
 * and its fixed or rigid body is silently left out of the run.
 */
export const constInpLengthMessage = (text: string): string | null => {
  const lineNumber = splitLines(text).findIndex(
    (line) => line.replace(/ +$/, '').length > MAX_CONST_INP_LINE_LENGTH
  )
  if (lineNumber !== -1) {
    return (
      `Line ${lineNumber + 1} is longer than ${MAX_CONST_INP_LINE_LENGTH} ` +
      'characters, which CHARMM cuts short. Split it over several lines, ' +
      'ending each line but the last with " -".'
    )
  }
  if (
    joinConstInpLines(text).some(
      (command) => command.trim().length > MAX_CONST_INP_COMMAND_LENGTH
    )
  ) {
    return (
      `A command is longer than ${MAX_CONST_INP_COMMAND_LENGTH} characters, ` +
      'which CHARMM cuts short. Split it into smaller selections.'
    )
  }
  return null
}

/**
 * The first command of a constraint file that doesn't start with one of
 * CONST_INP_ALLOWED_PREFIXES (trimmed), or null when every command does.
 * Continuation lines are joined first, as CHARMM reads them, and blank lines
 * are skipped. The worker runs this on the file right before CHARMM streams
 * it, whatever path the job took to the queue.
 */
export const findDisallowedConstInpLine = (text: string): string | null => {
  for (const line of joinConstInpLines(text)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const lower = trimmed.toLowerCase()
    if (
      !CONST_INP_ALLOWED_PREFIXES.some((prefix) => lower.startsWith(prefix))
    ) {
      return trimmed
    }
  }
  return null
}

/**
 * Names given to more than one `shape desc` line, in the order they first
 * repeat. CHARMM treats a repeated name as a change to the existing shape, not
 * a new one (https://academiccharmm.org/documentation/version/c51b1/shapes),
 * so a copy-pasted `dock1` silently drops a rigid body. Names are compared
 * case-insensitively, as CHARMM reads them.
 */
export const findDuplicateShapeNames = (text: string): string[] => {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const line of joinConstInpLines(text)) {
    const match = line.trim().match(/^shape\s+desc\w*\s+(\S+)/i)
    if (!match) continue
    const name = match[1]
    const key = name.toLowerCase()
    if (seen.has(key)) {
      if (!duplicates.some((d) => d.toLowerCase() === key)) {
        duplicates.push(name)
      }
    } else {
      seen.add(key)
    }
  }
  return duplicates
}

/**
 * The message for repeated `shape desc` names, or null when every name is
 * unique.
 */
export const duplicateShapeNamesMessage = (text: string): string | null => {
  const duplicates = findDuplicateShapeNames(text)
  if (duplicates.length === 0) return null
  const quoted = duplicates.map((name) => `"${name}"`).join(', ')
  return (
    `Each "shape desc" line needs its own name, but ${quoted} is used more ` +
    'than once. CHARMM would treat the repeat as a change to the earlier ' +
    'rigid body, not a new one. Rename them, e.g. dock1, dock2.'
  )
}

/**
 * Checks a CHARMM constraint file. `mode` is the job's input mode: 'pdb' and
 * 'crd_psf' also check the segment IDs that define lines select.
 * Returns true, or a message saying what is wrong.
 */
export const checkConstInpText = (
  text: string,
  mode?: string
): string | true => {
  // One entry per command, with continuation lines joined as CHARMM reads them
  const lines = joinConstInpLines(text).filter((line) => line.trim() !== '')

  if (lines.length === 0 || lines[lines.length - 1]?.trim() !== 'return') {
    return 'The last line must be "return".'
  }

  const tooLong = constInpLengthMessage(text)
  if (tooLong !== null) {
    return tooLong
  }

  const defineLines = lines.filter((line) => line.startsWith('define'))
  if (defineLines.length === 0) {
    return 'At least one line must start with "define".'
  }

  if (!lines.some((line) => line.startsWith('cons fix sele'))) {
    return 'At least one line must start with "cons fix sele".'
  }

  if (
    mode === 'pdb' &&
    !defineLines.every((line) =>
      /segid\s+((PRO|DNA|RNA|CAR|CAL)[A-Z])\b/.test(line)
    )
  ) {
    return 'segid must be: PRO[A-Z], DNA[A-Z], RNA[A-Z], etc.'
  }
  if (
    mode === 'crd_psf' &&
    !defineLines.every((line) => /segid\s+([A-Z]{4})\b/.test(line))
  ) {
    return 'segid must contain 4 uppercase letters [A-Z]'
  }

  // CHARMM ignores case and leading spaces, so count lines the way the
  // allowlist below reads them
  const shapeCommands = lines.filter((line) =>
    line.trim().toLowerCase().startsWith('shape')
  ).length
  if (shapeCommands > MAX_CONST_INP_SHAPE_COMMANDS) {
    return `Too many CHARMM shape commands. Maximum allowed is ${MAX_CONST_INP_SHAPE_COMMANDS}.`
  }

  const duplicateShapes = duplicateShapeNamesMessage(text)
  if (duplicateShapes !== null) {
    return duplicateShapes
  }

  const disallowed = findDisallowedConstInpLine(text)
  if (disallowed !== null) {
    return `Disallowed keyword in constraint file: "${disallowed}"`
  }

  return true
}
