import { parseCifAtomSite } from '@bilbomd/bilbomd-types'

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

export function parsePLDDTFromCIF(cifContent: string): {
  data: PLDDTData[]
  chainBoundaries: number[]
} {
  const parsed = parseCifAtomSite(cifContent)
  if (!parsed) return { data: [], chainBoundaries: [] }

  const { columnNames, dataRows } = parsed
  const chainIdx = columnNames.indexOf('auth_asym_id')
  const resIdx = columnNames.indexOf('auth_seq_id')
  const bfactorIdx = columnNames.indexOf('B_iso_or_equiv')
  const groupIdx = columnNames.indexOf('group_PDB')

  if (chainIdx === -1 || resIdx === -1 || bfactorIdx === -1) {
    return { data: [], chainBoundaries: [] }
  }

  const plddtData: PLDDTData[] = []
  const chainBoundaries: number[] = []
  let currentResidue = -1
  let currentPLDDT = 0
  let currentChain = ''
  let globalIndex = 0

  for (const row of dataRows) {
    const group = groupIdx >= 0 ? row[groupIdx] : 'ATOM'
    if (group !== 'ATOM') continue

    const chainId = row[chainIdx] || ''
    const residueNumber = parseInt(row[resIdx], 10)
    const plddt = parseFloat(row[bfactorIdx])
    if (isNaN(residueNumber) || isNaN(plddt)) continue

    if (residueNumber !== currentResidue || chainId !== currentChain) {
      if (currentResidue !== -1) {
        plddtData.push({
          globalIndex,
          residueNumber: currentResidue,
          plddt: currentPLDDT,
          chainId: currentChain
        })
        globalIndex++
      }
      if (currentChain && chainId !== currentChain) {
        chainBoundaries.push(globalIndex)
      }
      currentResidue = residueNumber
      currentPLDDT = plddt
      currentChain = chainId
    } else {
      currentPLDDT = (currentPLDDT + plddt) / 2
    }
  }
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
