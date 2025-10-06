export interface PLDDTData {
  residueNumber: number
  plddt: number
}

export function parsePLDDTFromPDB(pdbContent: string): PLDDTData[] {
  const lines = pdbContent.split('\n')
  const plddtData: PLDDTData[] = []
  let currentResidue = -1
  let currentPLDDT = 0

  for (const line of lines) {
    if (line.startsWith('ATOM')) {
      const residueNumber = parseInt(line.substring(22, 26).trim(), 10)
      const plddt = parseFloat(line.substring(60, 66).trim())

      if (residueNumber !== currentResidue) {
        if (currentResidue !== -1) {
          plddtData.push({ residueNumber: currentResidue, plddt: currentPLDDT })
        }
        currentResidue = residueNumber
        currentPLDDT = plddt
      } else {
        // Average pLDDT for multi-atom residues if needed
        currentPLDDT = (currentPLDDT + plddt) / 2
      }
    }
  }
  // Push the last residue
  if (currentResidue !== -1) {
    plddtData.push({ residueNumber: currentResidue, plddt: currentPLDDT })
  }
  return plddtData
}
