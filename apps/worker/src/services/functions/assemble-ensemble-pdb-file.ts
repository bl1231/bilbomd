import path from 'path'
import fs from 'fs-extra'
import { logger } from '../../helpers/loggers.js'
import {
  IJob,
  IMultiJob,
  IEnsemble,
  IEnsembleModel,
  IEnsembleMember
} from '@bilbomd/mongodb-schema'

interface AssembleEnsemblePdbFilesParams {
  numEnsembles: number
  multiFoxsDir: string
  jobDir: string
  resultsDir: string
  DBjob: IJob | IMultiJob
}

const assembleEnsemblePdbFiles = async ({
  numEnsembles,
  multiFoxsDir,
  jobDir,
  resultsDir,
  DBjob
}: AssembleEnsemblePdbFilesParams) => {
  const ensembles: IEnsemble[] = []

  for (let i = 1; i <= numEnsembles; i++) {
    const ensembleFile = path.join(multiFoxsDir, `ensembles_size_${i}.txt`)
    logger.info(`Processing ensemble file: ${ensembleFile}`)

    const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
    const ensemble = parseEnsembleFile(ensembleFileContent, i)
    ensembles.push(ensemble)

    // Save PDB files for the top-ranked model
    const topModelPdbFiles = ensemble.models[0]?.states.map(
      (state: IEnsembleMember) => path.join(jobDir, state.pdb)
    )
    if (topModelPdbFiles) {
      await concatenateAndSaveAsEnsemble(topModelPdbFiles, i, resultsDir)
    }
  }

  // Update the DBjob with the parsed results
  DBjob.results = DBjob.results || {}
  DBjob.results.classic = {
    total_num_ensembles: numEnsembles,
    ensembles
  }
  await DBjob.save()
  logger.info(`DBjob updated with ensemble results.`)
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
    for (let i = 0; i < pdbFiles.length; i++) {
      // Read the content of each PDB file
      let content = await fs.readFile(pdbFiles[i], 'utf8')

      // Replace the word "END" with "ENDMDL"
      content = content.replace(/\bEND\n?$/, 'ENDMDL')

      // Concatenate the content with MODEL....N
      concatenatedContent.push(`MODEL       ${i + 1}`)
      concatenatedContent.push(content)
    }

    // Save the concatenated content to the ensemble file
    const ensembleFileName = `ensemble_size_${ensembleSize}_model.pdb`
    const ensembleFile = path.join(resultsDir, ensembleFileName)
    await fs.writeFile(ensembleFile, concatenatedContent.join('\n'))

    logger.info(`Ensemble file saved: ${ensembleFile}`)
  } catch (error) {
    logger.error(`Error: ${error}`)
  }
}

export {
  assembleEnsemblePdbFiles,
  parseStateLine,
  isStateLine,
  parseEnsembleFile
}
