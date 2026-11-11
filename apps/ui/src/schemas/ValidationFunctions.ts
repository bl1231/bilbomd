import {
  GAFF_COFACTORS,
  METAL_COFACTORS,
  parseCifAtomSite,
  cifContainsChainId as cifContainsChainIdUtil,
  cifHasAllowedResiduesOnly as cifHasAllowedResiduesOnlyUtil,
  cifIsSingleModel as cifIsSingleModelUtil,
  analyzeSaxsData,
  isFromCharmmGui,
  isCrdText,
  isPsfText,
  pdbContainsChainId,
  pdbIsSingleModel,
  findUnsupportedPdbResidues,
  checkRnaResidues,
  checkConstInpText
} from '@bilbomd/bilbomd-types'
import type { QUnits, SaxsDataAnalysis } from '@bilbomd/bilbomd-types'
import { parsePLDDTFromPDB, parsePLDDTFromCIF } from '../utils/pdbUtils'

// The structure and constraint file checks live in @bilbomd/bilbomd-types and
// are shared with the backend, so a file passes the form only if the upload
// check will accept it. The wrappers below read the file and run them.

// A file's text, or null when it cannot be read
const readText = (file: File): Promise<string | null> =>
  file.text().catch(() => null)

// Rejects when the file cannot be read
const hasAllowedResiduesOnly = async (
  file: File
): Promise<{ valid: boolean; unsupportedResidues: string[] }> => {
  const unsupportedResidues = findUnsupportedPdbResidues(await file.text())
  return { valid: unsupportedResidues.length === 0, unsupportedResidues }
}

const fromCharmmGui = async (file: File): Promise<boolean> => {
  const text = await readText(file)
  return text !== null && isFromCharmmGui(text)
}

const isCRD = async (file: File): Promise<boolean> => {
  const text = await readText(file)
  return text !== null && isCrdText(text)
}

const isPsfData = async (file: File): Promise<boolean> => {
  const text = await readText(file)
  return text !== null && isPsfText(text)
}

const noSpaces = (file: File): Promise<boolean> => {
  const spaces = /\s/
  return new Promise((resolve) => {
    if (spaces.test(file.name)) {
      resolve(false)
    }
    resolve(true)
  })
}

// Let's break down the regex `/-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g`:

// 1. `/`: Delimiter for the start of the regular expression.
// 2. `-?`: Matches an optional hyphen `-`, which indicates a negative number.
// 3. `\d+`: Matches one or more digits (`\d` is a shorthand for digit characters `[0-9]`).
// 4. `(?:\.\d*)?`: This is a non-capturing group `(?: ... )?` that matches an optional decimal part of the number. It consists of:
//    - `\.`: Matches a dot character `.`.
//    - `\d*`: Matches zero or more digits after the decimal point.
// 5. `(?:[eE][+-]?\d+)?`: Another non-capturing group that matches an optional exponent part of the number. It consists of:
//    - `[eE]`: Matches either `e` or `E`, indicating the start of the exponent.
//    - `[+-]?`: Matches an optional sign (`+` or `-`) for the exponent.
//    - `\d+`: Matches one or more digits for the exponent.
// 6. `/`: Delimiter for the end of the regular expression.
// 7. `g`: Flags at the end of the regex indicating the global search, meaning it finds all matches rather than stopping after the first match.

// In summary, this regex pattern matches numbers in scientific notation format,
//  including optional negative sign, decimal part, and exponent part.
//  Examples of matches include `123`, `-123.45`, `1.23e4`, `-1.23e-4`, etc.

// Legacy first-q check, now used only for SANS data. SAXS data goes through
// analyzeSaxsFile below.
const isSansData = (
  file: File
): Promise<{ valid: boolean; message?: string }> => {
  const sciNotation = /-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsText(file)
    reader.onloadend = () => {
      const lines = (reader.result as string).split(/[\r\n]+/g)
      let dataLineCount = 0

      for (const line of lines) {
        if (line.startsWith('#') || line.trim() === '') {
          continue
        }

        const numbers = line.match(sciNotation)
        if (numbers && numbers.length >= 3) {
          const qValue = parseFloat(numbers[0]!)
          // Only the first q value is checked: it tells us the units. Say
          // so, or users trim the whole curve to this range.
          if (qValue > 0.04) {
            resolve({
              valid: false,
              message: `The first q value is ${qValue}. BilboMD needs q in Å⁻¹ (inverse ångströms), and a curve in Å⁻¹ normally starts below 0.04. If your data are in nm⁻¹, divide q by 10. Keep your full q-range; only the starting point is checked.`
            })
            return
          }
          if (qValue < 0.005) {
            resolve({
              valid: false,
              message: `The first q value is ${qValue} Å⁻¹, below BilboMD's minimum of 0.005 Å⁻¹. Remove the data points below 0.005 Å⁻¹.`
            })
            return
          }
          resolve({ valid: true })
          return
        }

        dataLineCount++
        if (dataLineCount >= 7) {
          break
        }
      }

      resolve({
        valid: false,
        message: 'No valid SAXS data found within the first 7 lines'
      })
    }

    reader.onerror = () => {
      resolve({ valid: false, message: 'Error reading the file' })
    }
  })
}

// Analyses are cached per file and q_units: Formik re-validates the whole
// form on every change, and the same file is also analyzed for its warnings.
const saxsAnalysisCache = new WeakMap<
  File,
  Partial<Record<QUnits, Promise<SaxsDataAnalysis>>>
>()

// Validates a SAXS data file with the same analysis the backend applies on
// upload (see analyzeSaxsData in @bilbomd/bilbomd-types).
const analyzeSaxsFile = (
  file: File,
  qUnits: QUnits = 'auto'
): Promise<SaxsDataAnalysis> => {
  const cached = saxsAnalysisCache.get(file) ?? {}
  saxsAnalysisCache.set(file, cached)
  cached[qUnits] ??= file
    .text()
    .then((text) => analyzeSaxsData(text, { qUnits }))
    .catch((): SaxsDataAnalysis => ({
      valid: false,
      message: 'Error reading the file',
      warnings: [],
      changed: false,
      points: [],
      stats: {
        totalPoints: 0,
        keptPoints: 0,
        trimmedLowQ: 0,
        trimmedHighQ: 0
      }
    }))
  return cached[qUnits]
}

type SaxsQualityResult = {
  lowSnrCount: number
  totalCount: number
  maxErrorRatio: number
  warning: string | null
}

// Scan a SAXS .dat file for data points where error/I > 2 (SNR < 0.5).
// Returns counts and a human-readable warning string when issues are found.
// This is informational only — the data is not invalid, just noisy.
const hasSaxsQualityIssues = (file: File): Promise<SaxsQualityResult> => {
  const sciNotation = /-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsText(file)
    reader.onloadend = () => {
      const lines = (reader.result as string).split(/[\r\n]+/g)
      let totalCount = 0
      let lowSnrCount = 0
      let maxErrorRatio = 0

      for (const line of lines) {
        if (line.startsWith('#') || line.trim() === '') continue
        const numbers = line.match(sciNotation)
        if (!numbers || numbers.length < 3) continue

        const I = parseFloat(numbers[1]!)
        const err = parseFloat(numbers[2]!)
        if (!Number.isFinite(I) || !Number.isFinite(err) || I <= 0) continue

        totalCount++
        const ratio = err / I
        if (ratio > maxErrorRatio) maxErrorRatio = ratio
        if (ratio > 2) lowSnrCount++
      }

      if (lowSnrCount === 0) {
        resolve({ lowSnrCount, totalCount, maxErrorRatio, warning: null })
        return
      }

      const pct =
        totalCount > 0 ? Math.round((lowSnrCount / totalCount) * 100) : 0
      resolve({
        lowSnrCount,
        totalCount,
        maxErrorRatio,
        warning:
          `${lowSnrCount} of ${totalCount} data points (${pct}%) have error/I > 2. ` +
          `These low-SNR points will be hidden in the FoXS plot. ` +
          `Consider trimming the high-q range of your .dat file.`
      })
    }
    reader.onerror = () =>
      resolve({
        lowSnrCount: 0,
        totalCount: 0,
        maxErrorRatio: 0,
        warning: null
      })
  })
}

const containsChainId = async (file: File): Promise<boolean> => {
  const text = await readText(file)
  return text !== null && pdbContainsChainId(text)
}

const noLeadingSpaceOnPDBLines = (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        reject(new Error('File load error: Event target or result is null'))
        return
      }

      const lines = text.split(/\r?\n/)
      const hasBadStart = lines.some(
        (line) => line.startsWith(' ATOM') || line.startsWith(' HETATM')
      )

      resolve(!hasBadStart)
    }

    reader.onerror = (e) => reject(new Error('Error reading file: ' + e))
    reader.readAsText(file)
  })
}

const isRNA = async (
  file: File
): Promise<{ valid: boolean; message?: string }> => {
  const text = await readText(file)
  if (text === null) return { valid: false, message: 'Error reading the file.' }
  return checkRnaResidues(text)
}

const isSingleModel = async (file: File): Promise<boolean> => {
  const text = await readText(file)
  return text !== null && pdbIsSingleModel(text)
}

const isValidConstInpFile = async (
  file: File,
  mode: string
): Promise<string | true> => {
  const text = await readText(file)
  if (text === null) return 'Error reading file'
  return checkConstInpText(text, mode)
}

const cifContainsChainId = (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        reject(new Error('File load error: Event target or result is null'))
        return
      }
      const parsed = parseCifAtomSite(text)
      resolve(parsed !== null && cifContainsChainIdUtil(parsed))
    }
    reader.onerror = (e) => reject(new Error('Error reading file: ' + e))
    reader.readAsText(file)
  })
}

const cifHasAllowedResiduesOnly = (
  file: File
): Promise<{ valid: boolean; unsupportedResidues: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        reject(new Error('File load error: Event target or result is null'))
        return
      }
      const parsed = parseCifAtomSite(text)
      if (!parsed) {
        resolve({
          valid: false,
          unsupportedResidues: ['(no _atom_site block found in CIF)']
        })
        return
      }
      resolve(cifHasAllowedResiduesOnlyUtil(parsed))
    }
    reader.onerror = () => reject(new Error('Error reading file'))
    reader.readAsText(file)
  })
}

const cifIsSingleModel = (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        reject(new Error('File load error: Event target or result is null'))
        return
      }
      const parsed = parseCifAtomSite(text)
      if (!parsed) {
        resolve(true) // no _atom_site block — let other checks catch it
        return
      }
      resolve(cifIsSingleModelUtil(parsed))
    }
    reader.onerror = (e) => reject(new Error('Error reading file: ' + e))
    reader.readAsText(file)
  })
}

const _detectResiduesFromSet = (
  file: File,
  residueSet: Set<string>
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        reject(new Error('File load error: Event target or result is null'))
        return
      }
      const found = new Set<string>()
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
          const resName = line.substring(17, 20).trim().toUpperCase()
          if (residueSet.has(resName)) found.add(resName)
        }
      }
      resolve(Array.from(found).sort())
    }
    reader.onerror = () => reject(new Error('Error reading file'))
    reader.readAsText(file)
  })
}

const detectGaffCofactors = (file: File): Promise<string[]> =>
  _detectResiduesFromSet(file, GAFF_COFACTORS)

const detectMetalCofactors = (file: File): Promise<string[]> =>
  _detectResiduesFromSet(file, METAL_COFACTORS)

// Detect a structure whose B-factor/pLDDT column is entirely zero. Some
// preparation tools (e.g. protonation) strip pLDDT, which silently breaks
// rigid-body detection for auto jobs. Reuses the shared pLDDT parsers.
const isPlddtColumnAllZero = (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string | undefined
      if (!text) {
        resolve(false)
        return
      }
      const isCif = file.name.toLowerCase().endsWith('.cif')
      const { data } = isCif ? parsePLDDTFromCIF(text) : parsePLDDTFromPDB(text)
      // Only warn when we actually parsed residues and every one is zero.
      resolve(data.length > 0 && data.every((d) => d.plddt === 0))
    }
    // On read error, don't block or warn — other validators handle bad files.
    reader.onerror = () => resolve(false)
    reader.readAsText(file)
  })
}

export {
  fromCharmmGui,
  isCRD,
  isPsfData,
  noSpaces,
  isSansData,
  analyzeSaxsFile,
  hasSaxsQualityIssues,
  isRNA,
  isSingleModel,
  cifIsSingleModel,
  containsChainId,
  cifContainsChainId,
  cifHasAllowedResiduesOnly,
  noLeadingSpaceOnPDBLines,
  isValidConstInpFile,
  hasAllowedResiduesOnly,
  detectGaffCofactors,
  detectMetalCofactors,
  isPlddtColumnAllZero
}
export type { SaxsQualityResult }
