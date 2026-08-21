import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { IJob, IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { FoxsData, FoxsDataPoint } from '@bilbomd/bilbomd-types'
import { getEnvVar } from '../../config/config.js'
import {
  parseFileContent,
  extractChiSquared,
  extractC1C2,
  extractScoperC1C2,
  readTopKNum
} from './foxsParser.js'
import { getGuinierFit } from './guinierService.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const createDataObject = async (
  file: string,
  jobDir: string
): Promise<FoxsData> => {
  try {
    await fs.access(file)
    const fileContent = await fs.readFile(file, 'utf8')
    const filename = path.basename(file)
    const data: FoxsDataPoint[] = parseFileContent(fileContent)
    const chisq: number = extractChiSquared(fileContent)

    const logFile = path.join(jobDir, 'initial_foxs_analysis.log')

    let c1 = 'unk'
    let c2 = 'unk'

    try {
      await fs.access(logFile)
      const extracted = await extractC1C2(logFile)
      c1 = extracted.c1 ?? 'unk'
      c2 = extracted.c2 ?? 'unk'
    } catch (logError) {
      logger.warn(`Log file not accessible or extraction failed: ${logError}`)
    }

    return { filename, chisq, c1, c2, data }
  } catch (error) {
    logger.error(`Failed to create data object: ${error}`)
    throw new Error(`Failed to process the data object: ${error}`)
  }
}

const buildBilboFoxsData = async (job: IJob): Promise<FoxsData[]> => {
  const data: FoxsData[] = []

  const jobDir = path.join(uploadFolder, job.uuid)
  const resultsDir = path.join(uploadFolder, job.uuid, 'results')

  if (!fs.existsSync(resultsDir)) {
    throw Object.assign(new Error('results directory unavailable.'), {
      status: 404
    })
  }

  const datFileBase = path.basename(job.data_file, path.extname(job.data_file))

  const possibleDatFiles = [
    path.join(jobDir, `minimization_output_${datFileBase}.dat`),
    path.join(
      jobDir,
      'charmm',
      'minimize',
      `minimization_output_${datFileBase}.dat`
    ),
    path.join(jobDir, `minimized_${datFileBase}.dat`),
    path.join(jobDir, 'minimize', `minimized_${datFileBase}.dat`),
    path.join(
      jobDir,
      'openmm',
      'minimization',
      `minimized_${datFileBase}.dat`
    ),
    path.join(resultsDir, `minimization_output_${datFileBase}.dat`),
    path.join(resultsDir, `minimized_${datFileBase}.dat`)
  ]

  let foundDatFile: string | null = null
  for (const datFile of possibleDatFiles) {
    try {
      await fs.access(datFile)
      foundDatFile = datFile
      break
    } catch {
      // File not found, try next
    }
  }

  if (foundDatFile) {
    data.push(await createDataObject(foundDatFile, jobDir))
  } else {
    logger.warn(
      `No original .dat file found for base ${datFileBase} (proceeding with ensemble data if present)`
    )
  }

  let files: string[] = []
  let ensembleCount = 0
  try {
    files = await fs.readdir(resultsDir)
  } catch (e) {
    logger.warn(
      `FoXS results directory not readable: ${resultsDir} (${(e as Error).message})`
    )
  }

  const filePattern = /^multi_state_model_(\d+)_1_1\.dat$/
  const matchingFiles = files
    .filter((file) => filePattern.test(file))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/multi_state_model_(\d+)_/)![1], 10)
      const bNum = parseInt(b.match(/multi_state_model_(\d+)_/)![1], 10)
      return aNum - bNum
    })

  for (const file of matchingFiles) {
    const filename = path.join(resultsDir, file)
    try {
      data.push(await createDataObject(filename, jobDir))
      ensembleCount += 1
    } catch (e) {
      logger.warn(
        `Skipping unreadable FoXS ensemble file ${filename}: ${(e as Error).message}`
      )
    }
  }

  if (!foundDatFile && ensembleCount === 0) {
    throw Object.assign(
      new Error(
        'No FoXS data available for this job (experimental .dat missing and no ensemble outputs found).'
      ),
      {
        status: 404,
        code: 'FOXS_DATA_UNAVAILABLE',
        details: { datBase: datFileBase }
      }
    )
  }

  // Attach the Guinier fit of the experimental profile (for dimensionless
  // Kratky normalization in the UI). Absence is non-fatal — the UI degrades
  // to an informative alert.
  const guinier = await getGuinierFit(jobDir, job.data_file)
  if (guinier && data[0]) {
    data[0].guinier = guinier
  }

  return data
}

const buildScoperFoxsData = async (
  job: IBilboMDScoperJob
): Promise<FoxsData[]> => {
  const datFileBase = path.basename(job.data_file, path.extname(job.data_file))
  const pdbFileBase = path.basename(job.pdb_file, path.extname(job.pdb_file))
  const topKFile = path.join(uploadFolder, job.uuid, 'top_k_dirname.txt')
  const pdbNumber = await readTopKNum(topKFile)

  const foxsAnalysisDir = path.join(uploadFolder, job.uuid, 'foxs_analysis')
  if (!fs.existsSync(foxsAnalysisDir)) {
    throw Object.assign(new Error('FoXS analysis data not found.'), {
      status: 404
    })
  }

  const originalDat = path.join(
    uploadFolder,
    job.uuid,
    'foxs_analysis',
    `${pdbFileBase}_${datFileBase}.dat`
  )
  const scoperDat = path.join(
    uploadFolder,
    job.uuid,
    'foxs_analysis',
    `scoper_combined_newpdb_${pdbNumber}_${datFileBase}.dat`
  )
  const foxsLog = path.join(
    uploadFolder,
    job.uuid,
    'foxs_analysis',
    'foxs.log'
  )

  const originalDatContent = fs.readFileSync(originalDat, 'utf8')
  const scoperDatContent = fs.readFileSync(scoperDat, 'utf8')
  const foxsLogContent = fs.readFileSync(foxsLog, 'utf8')

  const dataFromOrig = parseFileContent(originalDatContent)
  const dataFromScop = parseFileContent(scoperDatContent)

  const chisqFromOrig = extractChiSquared(originalDatContent)
  const chisqFromScop = extractChiSquared(scoperDatContent)

  const { c1FromOrig, c1FromScop, c2FromOrig, c2FromScop } =
    extractScoperC1C2(foxsLogContent)

  return [
    {
      filename: job.pdb_file,
      chisq: chisqFromOrig,
      c1: c1FromOrig !== null ? String(c1FromOrig) : 'unk',
      c2: c2FromOrig !== null ? String(c2FromOrig) : 'unk',
      data: dataFromOrig
    },
    {
      filename: `scoper_combined_newpdb_${pdbNumber}.pdb`,
      chisq: chisqFromScop,
      c1: c1FromScop !== null ? String(c1FromScop) : 'unk',
      c2: c2FromScop !== null ? String(c2FromScop) : 'unk',
      data: dataFromScop
    }
  ]
}

export { buildBilboFoxsData, buildScoperFoxsData }
