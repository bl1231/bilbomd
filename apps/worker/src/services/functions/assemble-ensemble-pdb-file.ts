import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import {
  IJob,
  IMultiJob,
  IEnsemble,
  IEnsembleModel,
  IEnsembleMember
} from '@bilbomd/mongodb-schema'

interface AssembleEnsemblePdbFilesParams {
  DBjob: IJob | IMultiJob
}

const assembleEnsemblePdbFiles = async ({
  DBjob
}: AssembleEnsemblePdbFilesParams) => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const multiFoxsDir = path.join(jobDir, 'multifoxs')
  const resultsDir = path.join(jobDir, 'results')

  // Find all ensemble files to determine the number of ensembles
  const ensembleFiles = await fs.readdir(multiFoxsDir)
  const ensembleSizes = ensembleFiles
    .filter((file) => file.match(/^ensembles_size_\d+\.txt$/))
    .map((file) =>
      parseInt(file.match(/ensembles_size_(\d+)\.txt$/)?.[1] || '0', 10)
    )
    .filter((size) => size > 0)
    .sort((a, b) => a - b)

  const numEnsembles = ensembleSizes.length > 0 ? Math.max(...ensembleSizes) : 0
  logger.info(`Found ${numEnsembles} ensemble files in ${multiFoxsDir}`)

  const ensembles: IEnsemble[] = []

  for (const ensembleSize of ensembleSizes) {
    const ensembleFile = path.join(
      multiFoxsDir,
      `ensembles_size_${ensembleSize}.txt`
    )
    logger.info(`Processing ensemble file: ${ensembleFile}`)

    const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
    const ensemble = parseEnsembleFile(ensembleFileContent, ensembleSize)
    ensembles.push(ensemble)

    // Save PDB files for the top-ranked model
    const topModelPdbFiles = ensemble.models[0]?.states.map(
      (state: IEnsembleMember) => {
        // Resolve relative paths correctly from multifoxs directory to job directory
        // The ensemble file is in multiFoxsDir, so relative paths should resolve from there
        const resolvedPath = path.resolve(multiFoxsDir, state.pdb)
        logger.debug(`Resolving PDB path: ${state.pdb} -> ${resolvedPath}`)
        return resolvedPath
      }
    )
    if (topModelPdbFiles && topModelPdbFiles.length > 0) {
      logger.info(`Top model has ${topModelPdbFiles.length} PDB files:`)
      topModelPdbFiles.forEach((pdbFile, idx) => {
        logger.info(`  [${idx + 1}] ${pdbFile}`)
      })

      // Check if files exist before trying to concatenate
      const existingFiles = []
      for (const pdbFile of topModelPdbFiles) {
        const exists = await fs.pathExists(pdbFile)
        if (exists) {
          existingFiles.push(pdbFile)
        } else {
          logger.warn(`PDB file does not exist: ${pdbFile}`)
        }
      }

      if (existingFiles.length > 0) {
        await concatenateAndSaveAsEnsemble(
          existingFiles,
          ensembleSize,
          resultsDir
        )
      } else {
        logger.error(`No PDB files found for ensemble size ${ensembleSize}`)
      }
    } else {
      logger.warn(`No top model found for ensemble size ${ensembleSize}`)
    }
  }

  // Update the DBjob with the parsed results
  DBjob.results = DBjob.results || {}
  const resultsKey = getResultsKey(DBjob.__t)
  const ensembleResults = {
    total_num_ensembles: numEnsembles,
    ensembles
  }

  switch (resultsKey) {
    case 'classic':
      DBjob.results.classic = ensembleResults
      break
    case 'auto':
      DBjob.results.auto = ensembleResults
      break
    case 'alphafold':
      DBjob.results.alphafold = ensembleResults
      break
    default:
      logger.error(`Unsupported job type '${DBjob.__t}' for ensemble results`)
      throw new Error(
        `Cannot store ensemble results for job type: ${DBjob.__t}`
      )
  }

  await DBjob.save()
  logger.info(`DBjob updated with ensemble results.`)
}

const getResultsKey = (discriminator: string): string => {
  switch (discriminator) {
    case 'BilboMdPDB':
    case 'BilboMdCRD':
      return 'classic'
    case 'BilboMdAuto':
      return 'auto'
    case 'BilboMdAlphaFold':
      return 'alphafold'
    case 'BilboMdSANS':
      return 'sans'
    case 'BilboMdScoper':
      return 'scoper'
    default:
      logger.warn(
        `Unknown discriminator '${discriminator}', defaulting to 'classic'`
      )
      return 'classic'
  }
}

const parseEnsembleFile = (content: string, size: number): IEnsemble => {
  const lines = content.split('\n').filter((line) => line.trim() !== '')
  const models: IEnsembleModel[] = []

  let currentModel: IEnsembleModel | null = null

  for (const line of lines) {
    if (isModelSummaryLine(line)) {
      if (currentModel) {
        models.push(currentModel)
      }
      currentModel = parseModelSummaryLine(line)
    } else if (currentModel && isStateLine(line)) {
      const state = parseStateLine(line)
      currentModel.states.push(state)
    }
  }

  if (currentModel) {
    models.push(currentModel)
  }

  return { size, models }
}

const isModelSummaryLine = (line: string): boolean => {
  return /^\d+ \|/.test(line)
}

const parseModelSummaryLine = (line: string): IEnsembleModel => {
  const [rankPart, chi2Part, c1c2Part] = line
    .split('|')
    .map((part) => part.trim())
  const rank = parseInt(rankPart, 10)
  const chi2 = parseFloat(chi2Part)
  const [c1, c2] = c1c2Part
    .match(/\(([^)]+)\)/)?.[1]
    .split(',')
    .map((val) => parseFloat(val.trim())) || [0, 0]

  return { rank, chi2, c1, c2, states: [] }
}

const isStateLine = (line: string): boolean => {
  return /^\s+\d+\s+\|/.test(line) && line.includes('.pdb.dat')
}

const parseStateLine = (line: string): IEnsembleMember => {
  try {
    const [, weightPart, pdbPart] = line.split('|').map((part) => part.trim())
    const weight = parseFloat(weightPart.split(' ')[0])
    const [weight_avg, weight_stddev] = weightPart
      .match(/\(([^)]+)\)/)?.[1]
      .split(',')
      .map((val) => parseFloat(val.trim())) || [0, 0]
    const pdbMatch = pdbPart.match(/([^"\s]+\.pdb\.dat)/)
    const pdb = pdbMatch ? pdbMatch[1].replace(/\.dat$/, '') : ''
    const fraction = parseFloat(pdbPart.match(/\(([^)]+)\)/)?.[1] || '0')

    return { pdb, weight, weight_avg, weight_stddev, fraction }
  } catch (error) {
    logger.error(`Error parsing state line: ${error}`)
    logger.error(`Error parsing state line: ${line}`)
    return { pdb: '', weight: 0, weight_avg: 0, weight_stddev: 0, fraction: 0 }
  }
}

const concatenateAndSaveAsEnsemble = async (
  pdbFiles: string[],
  ensembleSize: number,
  resultsDir: string
) => {
  try {
    const concatenatedContent: string[] = []

    logger.info(
      `Concatenating ${pdbFiles.length} PDB files for ensemble size ${ensembleSize}`
    )

    for (let i = 0; i < pdbFiles.length; i++) {
      try {
        // Read the content of each PDB file
        logger.debug(`Reading PDB file: ${pdbFiles[i]}`)
        let content = await fs.readFile(pdbFiles[i], 'utf8')

        // Replace the word "END" with "ENDMDL"
        content = content.replace(/\bEND\n?$/, 'ENDMDL')

        // Concatenate the content with MODEL....N
        concatenatedContent.push(`MODEL       ${i + 1}`)
        concatenatedContent.push(content)

        logger.debug(
          `Successfully processed PDB file ${i + 1}/${pdbFiles.length}`
        )
      } catch (fileError) {
        logger.error(`Error reading PDB file ${pdbFiles[i]}: ${fileError}`)
        throw fileError // Re-throw to stop the ensemble creation
      }
    }

    // Save the concatenated content to the ensemble file
    const ensembleFileName = `ensemble_size_${ensembleSize}_model.pdb`
    const ensembleFile = path.join(resultsDir, ensembleFileName)
    await fs.writeFile(ensembleFile, concatenatedContent.join('\n'))

    logger.info(
      `Ensemble file saved: ${ensembleFile} (${concatenatedContent.length} lines)`
    )
  } catch (error) {
    logger.error(
      `Error creating ensemble file for size ${ensembleSize}: ${error}`
    )
    throw error // Re-throw to let the caller handle it
  }
}

export {
  assembleEnsemblePdbFiles,
  parseStateLine,
  isStateLine,
  parseEnsembleFile,
  concatenateAndSaveAsEnsemble
}
