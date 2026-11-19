const atomLines = (src: string) =>
  src
    .split('\n')
    .filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'))

/**
 * Why a PDB file's text can't be used by the jiffy, or null when it can:
 * it needs ATOM/HETATM records, each with a chain ID (column 22).
 */
export const pdbTextProblem = (src: string): string | null => {
  const atoms = atomLines(src)
  if (atoms.length === 0) {
    return 'Invalid PDB file: No ATOM/HETATM records found.'
  }
  if (atoms.some((line) => line.substring(21, 22).trim() === '')) {
    return 'One or more atoms in the PDB file do not have a chain ID.'
  }
  return null
}
