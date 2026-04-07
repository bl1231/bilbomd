import fs from 'fs-extra'
import { FoxsDataPoint } from '@bilbomd/bilbomd-types'

const parseFileContent = (fileContent: string): FoxsDataPoint[] => {
  return fileContent
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 4)
    .map(([q, exp_intensity, model_intensity, error]) => {
      const qn = Number.parseFloat(q)
      const ei = Number.parseFloat(exp_intensity)
      const mi = Number.parseFloat(model_intensity)
      const er = Number.parseFloat(error)
      return {
        q: Number.isFinite(qn) ? qn : 0,
        exp_intensity: Number.isFinite(ei) ? ei : 0,
        model_intensity: Number.isFinite(mi) ? mi : 0,
        error: Number.isFinite(er) && er > 0 ? er : 1
      }
    })
}

const extractChiSquared = (fileContent: string): number => {
  const lines = fileContent.split('\n')
  if (lines.length < 2) {
    return 0.0
  }

  const chiSquaredLine = lines[1]
  const chiSquaredMatch = chiSquaredLine.match(/Chi\^2\s*=\s*([\d.]+)/)

  if (chiSquaredMatch && chiSquaredMatch[1]) {
    return parseFloat(chiSquaredMatch[1])
  } else {
    return 0.0
  }
}

const extractC1C2 = async (
  logFilePath: string
): Promise<{ c1: string; c2: string }> => {
  const logContent = await fs.readFile(logFilePath, 'utf8')
  const c1Match = logContent.match(/c1\s*=\s*([\d.-]+)/)
  const c2Match = logContent.match(/c2\s*=\s*([\d.-]+)/)

  if (!c1Match || !c2Match) {
    throw new Error('Could not find c1 and c2 values in log file')
  }

  const c1 = parseFloat(c1Match[1]).toFixed(2)
  const c2 = parseFloat(c2Match[1]).toFixed(2)
  return { c1, c2 }
}

// Extracts c1 and c2 for both the original and scoper-combined entries
// from a foxs.log file that contains results for two structures.
const extractScoperC1C2 = (
  fileContent: string
): { c1FromOrig: number | null; c1FromScop: number | null; c2FromOrig: number | null; c2FromScop: number | null } => {
  const lines = fileContent.split('\n')
  let c1FromOrig: number | null = null
  let c1FromScop: number | null = null
  let c2FromOrig: number | null = null
  let c2FromScop: number | null = null

  for (const line of lines) {
    const isScoperLine = line.startsWith('scoper_combined_')

    const c1Match = line.match(/c1\s*=\s*([-\d.]+)/)
    if (c1Match && c1Match[1]) {
      if (isScoperLine) {
        c1FromScop = parseFloat(c1Match[1])
      } else if (c1FromOrig === null) {
        c1FromOrig = parseFloat(c1Match[1])
      }
    }

    const c2Match = line.match(/c2\s*=\s*([-\d.]+)/)
    if (c2Match && c2Match[1]) {
      if (isScoperLine) {
        c2FromScop = parseFloat(c2Match[1])
      } else if (c2FromOrig === null) {
        c2FromOrig = parseFloat(c2Match[1])
      }
    }

    if (c1FromOrig !== null && c1FromScop !== null && c2FromOrig !== null && c2FromScop !== null) {
      break
    }
  }

  return { c1FromOrig, c1FromScop, c2FromOrig, c2FromScop }
}

const readTopKNum = async (file: string): Promise<number | null> => {
  try {
    const content = (await fs.readFile(file, 'utf-8')).trim()
    const match = content.match(/newpdb_(\d+)/)
    const pdbNumber = match ? parseInt(match[1], 10) : null
    return pdbNumber
  } catch (error) {
    throw new Error(`Could not determine top K PDB number: ${error}`)
  }
}

export {
  parseFileContent,
  extractChiSquared,
  extractC1C2,
  extractScoperC1C2,
  readTopKNum
}
