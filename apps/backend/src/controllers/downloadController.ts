import { logger } from '../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { Job, IJob, IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { FoxsData, FoxsDataPoint } from '../types/foxs.js'
import { Request, Response } from 'express'

const uploadFolder: string = path.join(process.env.DATA_VOL ?? '')

const downloadPDB = async (req: Request, res: Response) => {
  const jobId = req.params.id
  const pdbFilename = req.params.pdb
  if (!jobId) res.status(400).json({ message: 'Job ID required.' })
  if (!pdbFilename) res.status(400).json({ message: 'PDB filename required.' })
  logger.info(`looking up job: ${jobId}`)
  const job = await Job.findOne({ _id: jobId }).exec()
  if (!job) {
    res.status(204).json({ message: `No job matches ID ${jobId}.` })
    return
  }
  const pdbFile = path.join(uploadFolder, job.uuid, 'results', pdbFilename)

  try {
    await fs.promises.access(pdbFile)
    res.sendFile(pdbFile, (err) => {
      if (err) {
        res.status(500).json({
          message: 'Could not download the file . ' + err
        })
      } else {
        logger.info(`File ${pdbFilename} sent successfully.`)
      }
    })
  } catch (error) {
    logger.error(`No ${pdbFile} available. ${error}`)
    res.status(500).json({ message: `No ${pdbFile} available.` })
  }
}

const getFoxsData = async (req: Request, res: Response) => {
  const jobId = req.params.id

  if (!jobId) {
    res.status(400).json({ message: 'Job ID required.' })
    return
  }

  const job = await Job.findOne({ _id: jobId }).exec()
  if (!job) {
    res.status(404).json({ message: `No job matches ID ${jobId}.` })
    return
  }
  try {
    if (job.__t === 'BilboMdScoper') {
      const scoperJob = job as unknown as IBilboMDScoperJob
      await getFoxsScoperData(scoperJob, res)
    } else {
      await getFoxsBilboData(job, res)
    }
  } catch (error) {
    console.error(`Error getting FoXS data: ${error}`)
    res.status(500).json({ message: 'Error processing FoXS data.' })
  }
}

const getFoxsScoperData = async (job: IBilboMDScoperJob, res: Response) => {
  const datFileBase = path.basename(job.data_file, path.extname(job.data_file))
  const pdbFileBase = path.basename(job.pdb_file, path.extname(job.pdb_file))
  const topKFile = path.join(uploadFolder, job.uuid, 'top_k_dirname.txt')
  const pdbNumber = await readTopKNum(topKFile)

  const foxsAnalysisDir = path.join(uploadFolder, job.uuid, 'foxs_analysis')
  if (!fs.existsSync(foxsAnalysisDir)) {
    return res.status(404).json({ message: 'FoXS analysis data not found.' })
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

  const { c1FromOrig, c1FromScop } = extractC1Values(foxsLogContent)
  const { c2FromOrig, c2FromScop } = extractC2Values(foxsLogContent)

  const data = [
    {
      filename: job.pdb_file,
      chisq: chisqFromOrig,
      c1: c1FromOrig,
      c2: c2FromOrig,
      data: dataFromOrig
    },
    {
      filename: `scoper_combined_newpdb_${pdbNumber}.pdb`,
      chisq: chisqFromScop,
      c1: c1FromScop,
      c2: c2FromScop,
      data: dataFromScop
    }
  ]

  res.json(data)
}

const getFoxsBilboData = async (job: IJob, res: Response) => {
  try {
    const data: FoxsData[] = []

    const jobDir = path.join(uploadFolder, job.uuid)
    const resultsDir = path.join(uploadFolder, job.uuid, 'results')

    if (!fs.existsSync(resultsDir)) {
      return res.status(404).json({ message: 'results directory unavailable.' })
    }

    const datFileBase = path.basename(
      job.data_file,
      path.extname(job.data_file)
    )
    // Try all possible file names for the original .dat file
    // The OpenMM option does end up outputting to a subdirectory
    const possibleDatFiles = [
      path.join(jobDir, `minimization_output_${datFileBase}.dat`),
      path.join(jobDir, `minimized_${datFileBase}.dat`),
      path.join(
        jobDir,
        'openmm',
        'minimization',
        `minimized_${datFileBase}.dat`
      )
    ]

    let foundDatFile = null
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

    const filePattern = /^multi_state_model_\d+_1_1\.dat$/
    for (const file of files) {
      if (filePattern.test(file)) {
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
    }

    if (!foundDatFile && ensembleCount === 0) {
      // Nothing to show: return a clear, stable 404 the UI can handle
      return res.status(404).json({
        code: 'FOXS_DATA_UNAVAILABLE',
        message:
          'No FoXS data available for this job (experimental .dat missing and no ensemble outputs found).',
        details: { datBase: datFileBase }
      })
    }

    return res.json(data)
  } catch (error) {
    logger.error(`error getting FoXS analysis data ${error}`)
    return res
      .status(500)
      .json({
        message: 'Internal server error while processing FoXS analysis data.'
      })
  }
}

// Modify the createDataObject function to accept jobDir as an additional parameter
const createDataObject = async (
  file: string,
  jobDir: string
): Promise<FoxsData> => {
  try {
    // Check if the main file exists
    await fs.access(file)
    const fileContent = await fs.readFile(file, 'utf8')
    const filename = path.basename(file)
    const data: FoxsDataPoint[] = parseFileContent(fileContent)
    const chisq: number = extractChiSquared(fileContent)

    const logFile = path.join(jobDir, `initial_foxs_analysis.log`)

    // Initialize c1 and c2 with default values
    let c1 = 'unk'
    let c2 = 'unk'

    try {
      // Check if the log file exists and extract c1, c2
      // logger.info(`logFile: ${logFile}`)
      await fs.access(logFile)
      const extracted = await extractC1C2(logFile)
      // logger.info(`extracted: ${JSON.stringify(extracted)}`)
      c1 = extracted.c1 ?? 'unk'
      c2 = extracted.c2 ?? 'unk'
    } catch (logError) {
      // If the log file doesn't exist or extraction fails, default to 0.00
      logger.warn(`Log file not accessible or extraction failed: ${logError}`)
    }

    const foxsData: FoxsData = {
      filename,
      chisq,
      c1,
      c2,
      data
    }

    return foxsData
  } catch (error) {
    console.error('Failed to create data object:', error)
    throw new Error(`Failed to process the data object: ${error}`)
  }
}

const extractC1C2 = async (
  logFilePath: string
): Promise<{ c1: string; c2: string }> => {
  // logger.info('in extractC1C2 -----------------')
  const logContent = await fs.readFile(logFilePath, 'utf8')
  // logger.info(`Reading from log file: ${logFilePath}`)
  // logger.info(`Log content: ${logContent.substring(0, 500)}...`)
  // Use regular expressions to find c1 and c2, considering the format "c1 = <value> c2 = <value>"
  const c1Match = logContent.match(/c1\s*=\s*([\d.-]+)/)
  const c2Match = logContent.match(/c2\s*=\s*([\d.-]+)/)

  if (!c1Match || !c2Match) {
    throw new Error('Could not find c1 and c2 values in log file')
  }

  const c1 = parseFloat(c1Match[1]).toFixed(2)
  const c2 = parseFloat(c2Match[1]).toFixed(2)
  // logger.info(`c1: ${c1}`)
  // logger.info(`c2: ${c2}`)
  return { c1, c2 }
}

const readTopKNum = async (file: string) => {
  try {
    const content = (await fs.readFile(file, 'utf-8')).trim()
    // console.log(content)
    const match = content.match(/newpdb_(\d+)/)
    const pdbNumber = match ? parseInt(match[1], 10) : null
    return pdbNumber
  } catch (error) {
    logger.error(`Error reading top K file: ${error}`)
    throw new Error('Could not determine top K PDB number')
  }
}

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

  const chiSquaredLine = lines[1] // Get the second line
  const chiSquaredMatch = chiSquaredLine.match(/Chi\^2\s*=\s*([\d.]+)/)

  if (chiSquaredMatch && chiSquaredMatch[1]) {
    return parseFloat(chiSquaredMatch[1])
  } else {
    return 0.0 // Return null or appropriate default value if Chi^2 value is not found
  }
}

const extractC1Values = (fileContent: string) => {
  const lines = fileContent.split('\n')
  let c1FromOrig = null
  let c1FromScop = null

  for (const line of lines) {
    // Match lines containing 'c1 ='
    const c1Match = line.match(/c1\s*=\s*([-\d.]+)/)

    if (c1Match && c1Match[1]) {
      if (c1FromOrig === null) {
        c1FromOrig = parseFloat(c1Match[1])
      }

      // Check if the line starts with 'scoper_combined_'
      if (line.startsWith('scoper_combined_')) {
        c1FromScop = parseFloat(c1Match[1])
        break
      }
    }
  }
  // logger.info(`FoXS origC1: ${c1FromOrig} scopC1: ${c1FromScop}`)
  return { c1FromOrig, c1FromScop }
}

const extractC2Values = (fileContent: string) => {
  const lines = fileContent.split('\n')
  let c2FromOrig = null
  let c2FromScop = null

  for (const line of lines) {
    // Match lines containing 'c2 ='
    const c2Match = line.match(/c2\s*=\s*([-\d.]+)/)

    if (c2Match && c2Match[1]) {
      if (c2FromOrig === null) {
        c2FromOrig = parseFloat(c2Match[1])
      }

      // Check if the line starts with 'scoper_combined_'
      if (line.startsWith('scoper_combined_')) {
        c2FromScop = parseFloat(c2Match[1])
        break
      }
    }
  }
  // logger.info(`FoXS origC2: ${c2FromOrig} scopC2: ${c2FromScop}`)
  return { c2FromOrig, c2FromScop }
}

export { downloadPDB, getFoxsData, getFoxsBilboData }
