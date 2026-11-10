import { Request, Response } from 'express'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { isQUnits, Q_UNITS } from '@bilbomd/bilbomd-types'
import { logger } from '../middleware/loggers.js'
import { createUpload, getUploadErrorResponse } from '../middleware/upload.js'
import { getEnvVar } from '../config/config.js'
import { prepareSaxsDataFile } from './jobs/utils/saxsData.js'
import { parseEntities } from '../services/mwCheck/entities.js'
import {
  runMwCheck,
  type MwCheckModel
} from '../services/mwCheck/runMwCheck.js'

// The same limits the job validation schemas put on these files
const MAX_DAT_FILE_SIZE = 2_000_000
const MAX_PDB_FILE_SIZE = 10_000_000
const MAX_PSF_FILE_SIZE = 30_000_000

// Uploads are saved under names chosen here, never the client's
const SAVED_AS: Record<string, string> = {
  dat_file: 'expdata.dat',
  pdb_file: 'model.pdb',
  psf_file: 'model.psf'
}
const ENTITIES_FILE = 'entities.json'

type UploadedFiles = Record<string, Express.Multer.File[] | undefined>

const tooLarge = (file: Express.Multer.File | undefined, max: number) =>
  file !== undefined && file.size > max

// Compares the mass of the model a user is about to submit with the mass
// their SAXS data suggest. Takes dat_file plus one of pdb_file, psf_file or
// entities (a JSON list of sequences). Advisory: it never blocks a job.
const getMwCheck = async (req: Request, res: Response) => {
  const dir = path.join(getEnvVar('DATA_VOL'), 'mwcheck_uploads', uuid())
  const cleanUp = () =>
    fs
      .remove(dir)
      .catch((error) => logger.warn(`Could not remove ${dir}: ${error}`))

  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (error) {
    logger.error(`Could not create mass-check directory: ${error}`)
    res.status(500).json({ message: 'Failed to prepare the mass check.' })
    return
  }

  const upload = createUpload({
    destination: dir,
    filename: (file) => SAVED_AS[file.fieldname] ?? 'unexpected',
    maxFileSize: MAX_PSF_FILE_SIZE
  }).fields([
    { name: 'dat_file', maxCount: 1 },
    { name: 'pdb_file', maxCount: 1 },
    { name: 'psf_file', maxCount: 1 }
  ])

  type Outcome = { status: number; body: unknown }
  const reject = (status: number, message: string): Outcome => ({
    status,
    body: { message }
  })

  const check = async (err: unknown): Promise<Outcome> => {
    if (err) {
      const { status, message } = getUploadErrorResponse(err)
      return reject(status, message)
    }

    const files = (req.files ?? {}) as UploadedFiles
    const datFile = files.dat_file?.[0]
    const pdbFile = files.pdb_file?.[0]
    const psfFile = files.psf_file?.[0]
    const rawEntities: unknown = req.body?.entities
    const hasEntities = rawEntities !== undefined && rawEntities !== ''

    if (!datFile) return reject(400, 'A SAXS data file is required.')
    const sources = [pdbFile, psfFile, hasEntities || undefined].filter(
      (source) => source !== undefined
    )
    if (sources.length !== 1) {
      return reject(400, 'Send exactly one of pdb_file, psf_file or entities.')
    }
    if (
      tooLarge(datFile, MAX_DAT_FILE_SIZE) ||
      tooLarge(pdbFile, MAX_PDB_FILE_SIZE)
    ) {
      return reject(413, 'File too large.')
    }

    // The same unit conversion and trimming a submission applies, so the
    // estimate is made on the data the job would run on
    const qUnits: unknown = req.body?.q_units
    if (qUnits !== undefined && qUnits !== '' && !isQUnits(qUnits)) {
      return reject(400, `q_units must be one of: ${Q_UNITS.join(', ')}`)
    }
    const saxsData = await prepareSaxsDataFile(datFile, qUnits)
    if (!saxsData.ok) return reject(400, saxsData.message)

    let model: MwCheckModel
    if (pdbFile) {
      model = { kind: 'pdb', file: SAVED_AS.pdb_file! }
    } else if (psfFile) {
      model = { kind: 'psf', file: SAVED_AS.psf_file! }
    } else {
      const parsed = parseEntities(rawEntities)
      if (!parsed.ok) return reject(400, parsed.message)
      await fs.writeJson(path.join(dir, ENTITIES_FILE), parsed.entities)
      model = { kind: 'entities', file: ENTITIES_FILE }
    }

    return {
      status: 200,
      body: await runMwCheck(dir, SAVED_AS.dat_file!, model)
    }
  }

  upload(req, res, async (err) => {
    let outcome: Outcome
    try {
      outcome = await check(err)
    } catch (error) {
      logger.error(`Mass check failed: ${error}`)
      outcome = reject(500, 'Failed to run the mass check.')
    }
    // The uploads are gone before the client hears back
    await cleanUp()
    res.status(outcome.status).json(outcome.body)
  })
}

export { getMwCheck }
