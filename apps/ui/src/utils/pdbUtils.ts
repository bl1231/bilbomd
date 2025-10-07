export interface PLDDTData {
  globalIndex: number // New: Unique sequential index for plotting
  residueNumber: number // PDB residue number (may repeat across chains)
  plddt: number
  chainId: string
}

export function parsePLDDTFromPDB(pdbContent: string): {
  data: PLDDTData[]
  chainBoundaries: number[] // Now holds globalIndex values for boundaries
} {
  const lines = pdbContent.split('\n')
  const plddtData: PLDDTData[] = []
  const chainBoundaries: number[] = []
  let currentResidue = -1
  let currentPLDDT = 0
  let currentChain = ''
  let globalIndex = 0 // New: Counter for unique x-axis positions

  for (const line of lines) {
    if (line.startsWith('ATOM')) {
      const chainId = line.charAt(21).trim() // Column 22 (chain identifier)
      const residueNumber = parseInt(line.substring(22, 26).trim(), 10) // Columns 23-26 (residue number)
      const plddt = parseFloat(line.substring(60, 66).trim())

      if (residueNumber !== currentResidue) {
        // Push the previous residue (if any) with its globalIndex
        if (currentResidue !== -1) {
          plddtData.push({
            globalIndex,
            residueNumber: currentResidue,
            plddt: currentPLDDT,
            chainId: currentChain
          })
          globalIndex++ // Increment after pushing
        }
        // Check for chain boundary (new chain starts at this globalIndex)
        if (currentChain && chainId !== currentChain) {
          chainBoundaries.push(globalIndex)
        }
        // Update for the new residue
        currentResidue = residueNumber
        currentPLDDT = plddt
        currentChain = chainId
      } else {
        // Average pLDDT for multi-atom residues if needed
        currentPLDDT = (currentPLDDT + plddt) / 2
      }
    }
  }
  // Push the last residue
  if (currentResidue !== -1) {
    plddtData.push({
      globalIndex,
      residueNumber: currentResidue,
      plddt: currentPLDDT,
      chainId: currentChain
    })
  }
  return { data: plddtData, chainBoundaries }
}
