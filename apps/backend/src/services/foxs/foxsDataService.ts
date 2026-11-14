import { logger } from '../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { IJob, IBilboMDScoperJob, IMultiJob } from '@bilbomd/mongodb-schema'
import { FoxsData, FoxsDataPoint, FoxsFitKind } from '@bilbomd/bilbomd-types'
import { getEnvVar } from '../../config/config.js'
import {
  parseFileContent,
  extractChiSquared,
  extractC1C2,
  extractScoperC1C2,
  readTopKNum
} from './foxsParser.js'
import { getGuinierFit } from './guinierService.js'
import {
  CHI2FREE_ROUNDS,
  DMAX_PER_RG,
  VR_QMAX,
  computeChi2Free,
  computeVr,
  countShannonChannels,
  estimateDmax
} from './fitMetrics.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const createDataObject = async (
  file: string,
  jobDir: string,
  kind: FoxsFitKind
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

    return { filename, kind, chisq, c1, c2, data }
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
    path.join(jobDir, 'openmm', 'minimization', `minimized_${datFileBase}.dat`),
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
    data.push(await createDataObject(foundDatFile, jobDir, 'original'))
  } else {
    // Expected for job types with no starting model (BioEmu2); the response
    // then holds only ensembles and the UI shows no "Original Model" fit
    logger.warn(
      `No original .dat file found for base ${datFileBase} (proceeding with ensemble data if present)`
    )
  }

  const ensembles = await readEnsembleFits(resultsDir, jobDir)
  data.push(...ensembles)

  if (!foundDatFile && ensembles.length === 0) {
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

  await attachGuinier(data, jobDir, job.data_file)

  return data
}

// The SAXS data a Multi job was fitted against belongs to one of the runs it
// combines (`data_file_from`).
type MultiDataSource = { uuid: string; data_file: string }

// A Multi job has no starting model of its own, so its FoXS data are the
// MultiFoXS ensembles only. The Guinier fit comes from the run whose SAXS data
// MultiFoXS used; without that run (deleted) the fits are still returned.
const buildMultiFoxsData = async (
  job: IMultiJob,
  source: MultiDataSource | null
): Promise<FoxsData[]> => {
  const jobDir = path.join(uploadFolder, job.uuid)
  const resultsDir = path.join(jobDir, 'results')

  if (!fs.existsSync(resultsDir)) {
    throw Object.assign(new Error('results directory unavailable.'), {
      status: 404
    })
  }

  const data = await readEnsembleFits(resultsDir, jobDir)
  if (data.length === 0) {
    throw Object.assign(
      new Error(
        'No FoXS data available for this job (no ensemble outputs found).'
      ),
      { status: 404, code: 'FOXS_DATA_UNAVAILABLE' }
    )
  }

  if (source) {
    await attachGuinier(
      data,
      path.join(uploadFolder, source.uuid),
      source.data_file
    )
  } else {
    logger.warn(
      `Multi job ${job.uuid}: data source ${job.data_file_from} not found; no Guinier fit`
    )
  }
  return data
}

// The MultiFoXS fit of each ensemble size, in order of size
const readEnsembleFits = async (
  resultsDir: string,
  jobDir: string
): Promise<FoxsData[]> => {
  const fits: FoxsData[] = []
  let files: string[] = []
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
      fits.push(await createDataObject(filename, jobDir, 'ensemble'))
    } catch (e) {
      logger.warn(
        `Skipping unreadable FoXS ensemble file ${filename}: ${(e as Error).message}`
      )
    }
  }
  return fits
}

// Attach the Guinier fit of the experimental profile (for dimensionless
// Kratky normalization in the UI) and the fit metrics that need its Rg.
// Absence is non-fatal — the UI degrades to an informative alert.
const attachGuinier = async (
  data: FoxsData[],
  dataDir: string,
  dataFile: string
): Promise<void> => {
  const guinier = await getGuinierFit(dataDir, dataFile)
  if (guinier && data[0]) {
    data[0].guinier = guinier
    addFitMetrics(data, estimateDmax(guinier.rg))
  }
}

// Adds χ²free and Vr to every fit, all scored with the same Dmax so they are
// comparable across the original model and each ensemble size.
const addFitMetrics = (data: FoxsData[], dmax: number): void => {
  for (const fit of data) {
    fit.chi2free = computeChi2Free(fit.data, dmax)
    fit.vr = computeVr(fit.data, dmax)
  }
  data[0]!.fitMetrics = {
    dmax,
    dmaxSource: 'guinier_rg',
    dmaxPerRg: DMAX_PER_RG,
    shannonChannels: countShannonChannels(data[0]!.data, dmax),
    chi2freeRounds: CHI2FREE_ROUNDS,
    vrQmax: VR_QMAX
  }
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
  const foxsLog = path.join(uploadFolder, job.uuid, 'foxs_analysis', 'foxs.log')

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
      kind: 'original',
      chisq: chisqFromOrig,
      c1: c1FromOrig !== null ? String(c1FromOrig) : 'unk',
      c2: c2FromOrig !== null ? String(c2FromOrig) : 'unk',
      data: dataFromOrig
    },
    {
      filename: `scoper_combined_newpdb_${pdbNumber}.pdb`,
      kind: 'scoper',
      chisq: chisqFromScop,
      c1: c1FromScop !== null ? String(c1FromScop) : 'unk',
      c2: c2FromScop !== null ? String(c2FromScop) : 'unk',
      data: dataFromScop
    }
  ]
}

export { buildBilboFoxsData, buildMultiFoxsData, buildScoperFoxsData }
