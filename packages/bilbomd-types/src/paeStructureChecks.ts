import { parseCifAtomSite } from './cifUtils.js'

// --- PAE ↔ structure size -------------------------------------------------
// pae2const.py (tools/python) requires the PAE matrix to be N×N, where N is
// the number of distinct residues in the structure. These helpers count both
// the same way it does, so the job forms and the backend can reject a
// mismatch at submission instead of the job failing on the worker.

/**
 * PDBHandler._prepare_pdb_mappings: distinct (chain, resSeq, iCode) over
 * every ATOM/HETATM record.
 */
export const countPdbResidues = (text: string): number => {
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue
    const resSeq = line.slice(22, 26).trim()
    if (!/^[+-]?\d+$/.test(resSeq)) continue
    const chain = (line[21] ?? '').trim() || ' '
    const iCode = (line[26] ?? '').trim()
    seen.add(`${chain}|${Number(resSeq)}|${iCode}`)
  }
  return seen.size
}

/**
 * CIFHandler uses Biopython's MMCIFParser, which keys residues on the author
 * chain, sequence number and insertion code.
 */
export const countCifResidues = (text: string): number => {
  const parsed = parseCifAtomSite(text)
  if (!parsed) return 0
  const col = (...names: string[]) =>
    names.map((n) => parsed.columnNames.indexOf(n)).find((i) => i !== -1) ?? -1
  const chainIdx = col('auth_asym_id', 'label_asym_id')
  const seqIdx = col('auth_seq_id', 'label_seq_id')
  const iCodeIdx = col('pdbx_PDB_ins_code')
  if (chainIdx === -1 || seqIdx === -1) return 0
  const blank = (v: string | undefined) => (v === '?' || v === '.' ? '' : v)
  const seen = new Set<string>()
  for (const row of parsed.dataRows) {
    const seq = blank(row[seqIdx])
    if (!seq) continue
    const iCode = iCodeIdx === -1 ? '' : (blank(row[iCodeIdx]) ?? '')
    seen.add(`${row[chainIdx]}|${seq}|${iCode}`)
  }
  return seen.size
}

/**
 * PaeConstraintsProcessor.load_pae_data + validate_alignment. Returns the
 * matrix size, an error for a PAE file the worker would reject, or null when
 * the file is not valid JSON (the JSON check reports that).
 */
export const getPaeMatrixSize = (
  text: string
): { size: number } | { error: string } | null => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  // load_pae_data unwraps a top-level list by stripping its brackets, which
  // only yields valid JSON when the list holds exactly one object
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      data = JSON.parse(text.slice(1, -1))
    } catch {
      return {
        error:
          'PAE file must be a JSON object, or a list holding exactly one object.'
      }
    }
  }
  const obj =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  const key = ['predicted_aligned_error', 'pae', 'pde'].find((k) => k in obj)
  if (!key) {
    return {
      error:
        "PAE file must contain a 'predicted_aligned_error', 'pae' or 'pde' matrix."
    }
  }
  const matrix = obj[key]
  const n = Array.isArray(matrix) ? matrix.length : 0
  const square =
    n > 0 &&
    (matrix as unknown[]).every((row) => Array.isArray(row) && row.length === n)
  if (!square) {
    return { error: `The '${key}' matrix in the PAE file is not square.` }
  }
  return { size: n }
}

/**
 * Compares a PAE matrix size with a structure's residue count. Returns a
 * message when they differ, or null when they match or the structure's
 * residues could not be counted (its own checks report that).
 */
export const paeResidueMismatchMessage = (
  paeSize: number,
  residues: number
): string | null => {
  if (residues === 0 || residues === paeSize) return null
  return (
    `The PAE matrix is ${paeSize} × ${paeSize} but the structure has ${residues} residues. ` +
    'Upload the PAE file and structure from the same AlphaFold model, and remove ' +
    'residues the model does not include (glycans, ligands, waters, tags).'
  )
}
