import { SUPPORTED_PDB_RESIDUES } from './pdbResidues.js'

/**
 * Parsed representation of the _atom_site loop block from an mmCIF file.
 * columnNames are the field suffixes (e.g. 'label_comp_id', 'auth_asym_id').
 * dataRows are the whitespace-split token arrays for each data line.
 */
export type CifAtomSiteParsed = {
  columnNames: string[]
  dataRows: string[][]
}

/**
 * Parse the _atom_site loop block from mmCIF text.
 * Returns null if no _atom_site loop is found.
 */
export const parseCifAtomSite = (text: string): CifAtomSiteParsed | null => {
  const lines = text.split(/\r?\n/)
  const columnNames: string[] = []
  let inAtomSiteLoop = false
  let headerDone = false
  const dataRows: string[][] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!inAtomSiteLoop) {
      // Look for a loop_ immediately followed by _atom_site. column declarations
      if (line === 'loop_') {
        const next = lines[i + 1]?.trim() ?? ''
        if (next.startsWith('_atom_site.')) {
          inAtomSiteLoop = true
          columnNames.length = 0
          headerDone = false
        }
      }
      continue
    }

    if (!headerDone) {
      if (line.startsWith('_atom_site.')) {
        // Strip the '_atom_site.' prefix and store the column name
        columnNames.push(line.slice('_atom_site.'.length))
      } else if (line === '' || line.startsWith('#')) {
        // blank / comment inside header — skip
      } else {
        // First non-header line: start of data
        headerDone = true
        if (line && !line.startsWith('_') && !line.startsWith('loop_')) {
          dataRows.push(line.split(/\s+/).filter(Boolean))
        }
      }
      continue
    }

    // In data section — stop at next category, loop, or end of block
    if (
      line.startsWith('_') ||
      line === 'loop_' ||
      line.startsWith('data_') ||
      line.startsWith('save_')
    ) {
      break
    }
    if (line === '' || line.startsWith('#')) continue
    dataRows.push(line.split(/\s+/).filter(Boolean))
  }

  if (columnNames.length === 0) return null
  return { columnNames, dataRows }
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
