import { SUPPORTED_PDB_RESIDUES } from './pdbResidues.js'

/**
 * Parsed representation of the _atom_site loop block from an mmCIF file.
 * columnNames are the field suffixes (e.g. 'label_comp_id', 'auth_asym_id').
 * dataRows hold one value per column for each atom record, with quotes removed.
 */
export type CifAtomSiteParsed = {
  columnNames: string[]
  dataRows: string[][]
}

type CifToken = { value: string; quoted: boolean }

const isCifSpace = (c: string | undefined) =>
  c === ' ' || c === '\t' || c === '\r' || c === '\n'

// Split one line into tokens. Follows Biopython's MMCIF2Dict._splitline,
// which the worker's MMCIFParser uses: a quote opens a value only at the start
// of a token and closes only when followed by whitespace, and '#' outside a
// token starts a comment.
const splitCifLine = (line: string): CifToken[] => {
  const tokens: CifToken[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (isCifSpace(c)) {
      i++
    } else if (c === '#') {
      break
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (
        j < line.length &&
        !(line[j] === c && (j + 1 === line.length || isCifSpace(line[j + 1])))
      )
        j++
      tokens.push({ value: line.slice(i + 1, j), quoted: true })
      i = j + 1
    } else {
      let j = i
      while (j < line.length && !isCifSpace(line[j])) j++
      tokens.push({ value: line.slice(i, j), quoted: false })
      i = j
    }
  }
  return tokens
}

// Tokenize a whole CIF file. Values are separated by whitespace, not lines,
// so one record can wrap across lines and one line can hold several records.
// A line starting with ';' opens a text field that runs to the next such line.
const tokenizeCif = (text: string): CifToken[] => {
  const lines = text.split(/\r?\n/)
  const tokens: CifToken[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith(';')) {
      const buffer = [line.slice(1).trimEnd()]
      while (++i < lines.length && !lines[i].startsWith(';')) {
        buffer.push(lines[i].trimEnd())
      }
      tokens.push({ value: buffer.join('\n'), quoted: true })
      if (i < lines.length) tokens.push(...splitCifLine(lines[i].slice(1)))
      continue
    }
    tokens.push(...splitCifLine(line))
  }
  return tokens
}

// An unquoted tag or reserved word ends a loop's values
const endsLoop = ({ value, quoted }: CifToken) => {
  if (quoted) return false
  const v = value.toLowerCase()
  return (
    v.startsWith('_') ||
    v === 'loop_' ||
    v === 'stop_' ||
    v === 'global_' ||
    v.startsWith('data_') ||
    v.startsWith('save_')
  )
}

/**
 * Parse the _atom_site loop block from mmCIF text.
 * Returns null if no _atom_site loop is found.
 */
export const parseCifAtomSite = (text: string): CifAtomSiteParsed | null => {
  const tokens = tokenizeCif(text)
  for (let i = 0; i < tokens.length; i++) {
    const tag = tokens[i + 1]
    if (
      tokens[i].quoted ||
      tokens[i].value.toLowerCase() !== 'loop_' ||
      !tag ||
      tag.quoted ||
      !tag.value.startsWith('_atom_site.')
    ) {
      continue
    }

    const columnNames: string[] = []
    let j = i + 1
    while (
      j < tokens.length &&
      !tokens[j].quoted &&
      tokens[j].value.startsWith('_atom_site.')
    ) {
      columnNames.push(tokens[j].value.slice('_atom_site.'.length))
      j++
    }

    const values: string[] = []
    while (j < tokens.length && !endsLoop(tokens[j])) {
      values.push(tokens[j].value)
      j++
    }

    // Group values into records of one value per column. A trailing partial
    // record is malformed and dropped.
    const dataRows: string[][] = []
    for (
      let k = 0;
      k + columnNames.length <= values.length;
      k += columnNames.length
    ) {
      dataRows.push(values.slice(k, k + columnNames.length))
    }
    return { columnNames, dataRows }
  }
  return null
}

/**
 * Returns true if the parsed _atom_site block contains at least one row
 * with a non-empty, non-placeholder auth_asym_id (chain ID).
 */
export const cifContainsChainId = (parsed: CifAtomSiteParsed): boolean => {
  const idx = parsed.columnNames.indexOf('auth_asym_id')
  if (idx === -1) return false
  return parsed.dataRows.some((row) => {
    const val = row[idx]
    return val !== undefined && val !== '.' && val !== '?'
  })
}

/**
 * Returns true if the parsed _atom_site block contains only one unique
 * pdbx_PDB_model_num value (or if the column is absent, implying a single model).
 */
export const cifIsSingleModel = (parsed: CifAtomSiteParsed): boolean => {
  const idx = parsed.columnNames.indexOf('pdbx_PDB_model_num')
  if (idx === -1) return true // no model column → single model
  const seen = new Set<string>()
  for (const row of parsed.dataRows) {
    const val = row[idx]
    if (val && val !== '.' && val !== '?') {
      seen.add(val)
      if (seen.size > 1) return false
    }
  }
  return true
}

/**
 * Checks every unique residue name in the _atom_site block against
 * SUPPORTED_PDB_RESIDUES. Returns valid: true if all residues are supported,
 * or valid: false with the list of unsupported residue names.
 *
 * Tries label_comp_id first, falls back to auth_comp_id.
 */
export const cifHasAllowedResiduesOnly = (
  parsed: CifAtomSiteParsed
): { valid: boolean; unsupportedResidues: string[] } => {
  let idx = parsed.columnNames.indexOf('label_comp_id')
  if (idx === -1) idx = parsed.columnNames.indexOf('auth_comp_id')
  if (idx === -1) {
    return { valid: false, unsupportedResidues: ['(residue column not found)'] }
  }

  const unsupported = new Set<string>()
  for (const row of parsed.dataRows) {
    const val = row[idx]?.trim().toUpperCase()
    if (val && val !== '.' && val !== '?') {
      if (!SUPPORTED_PDB_RESIDUES.has(val)) {
        unsupported.add(val)
      }
    }
  }

  return {
    valid: unsupported.size === 0,
    unsupportedResidues: Array.from(unsupported).sort()
  }
}
