import fs from 'fs-extra'
import {
  analyzeSaxsData,
  isQUnits,
  SAXS_MAX_FILE_SIZE
} from '@bilbomd/bilbomd-types'
import { logger } from '../../../middleware/loggers.js'

type PreparedSaxsData =
  { ok: true; warnings: string[] } | { ok: false; message: string }

// Validates the uploaded SAXS data and, when it needs converting to Å⁻¹ or
// trimming, rewrites it in place (the upload is kept as `<name>.orig`). Must
// run before anything reads the file (AutoRg, the job schema) so that every
// later step sees q in Å⁻¹ within the supported range.
//
// Problems the job schema reports on its own (missing file, oversized file,
// bad q_units value) are left to it, so this only fails on the data itself.
const prepareSaxsDataFile = async (
  file: Express.Multer.File | undefined,
  rawQUnits: unknown
): Promise<PreparedSaxsData> => {
  const qUnits =
    rawQUnits === undefined || rawQUnits === '' ? 'auto' : rawQUnits
  if (!file?.path || file.size > SAXS_MAX_FILE_SIZE || !isQUnits(qUnits)) {
    return { ok: true, warnings: [] }
  }

  let text: string
  try {
    text = await fs.readFile(file.path, 'utf8')
  } catch (err) {
    logger.error('Error reading SAXS file:', err)
    return { ok: false, message: 'Error reading SAXS file content' }
  }
  const analysis = analyzeSaxsData(text, { qUnits })
  if (!analysis.valid) {
    logger.warn(`SAXS data ${file.originalname} rejected: ${analysis.message}`)
    return { ok: false, message: analysis.message ?? 'SAXS data invalid.' }
  }

  if (analysis.changed && analysis.normalizedText !== undefined) {
    await fs.copyFile(file.path, `${file.path}.orig`)
    await fs.writeFile(file.path, analysis.normalizedText)
  }
  for (const warning of analysis.warnings) {
    logger.info(`SAXS data ${file.originalname}: ${warning}`)
  }
  return { ok: true, warnings: analysis.warnings }
}

// Same shape as the job schemas' validation failures
const saxsDataError = (message: string) => ({
  message: 'Validation failed',
  errors: [{ path: 'dat_file', message }]
})

export { prepareSaxsDataFile, saxsDataError }
