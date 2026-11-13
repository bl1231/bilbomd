import { logger } from '../../../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { Job } from '@bilbomd/mongodb-schema'
import { wrapLongConstInpLines } from '@bilbomd/bilbomd-types'
import { BilboMDSteps } from '../../../types/bilbomd.js'
import { getEnvVar } from '../../../config/config.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

const writeJobParams = async (jobID: string): Promise<void> => {
  try {
    const job = await Job.findById(jobID).populate('user').exec()
    if (!job) {
      throw new Error('Job not found')
    }
    const UUID = job.uuid
    // Convert the Mongoose document to a plain object
    const jobObject = job.toObject({ virtuals: true, versionKey: false })
    // Exclude metadata like mongoose versionKey, etc, if necessary
    // delete jobObject.__v // Optionally remove version key if not done globally

    // Serialize to JSON with pretty printing
    const jobJson = JSON.stringify(jobObject, null, 2)
    const jobDir = path.join(uploadFolder, UUID)
    // Define the path for the params.json file
    const paramsFilePath = path.join(jobDir, 'params.json') // Adjust the directory path as needed

    // Write JSON string to a file
    await fs.writeFile(paramsFilePath, jobJson)
    logger.info(`Saved params.json to ${paramsFilePath}`)
  } catch (error) {
    logger.error(`Unable to save params.json: ${error}`)
  }
}

// Rewraps long lines with the shared const.inp wrapper, which keeps '-'
// continuations intact and never adds 'end'. The upload checks have already
// limited every line to what CHARMM reads, so this only shortens lines.
const sanitizeConstInpFile = async (filePath: string): Promise<void> => {
  const fileContents = await fs.readFile(filePath, 'utf-8')
  await fs.writeFile(filePath, wrapLongConstInpLines(fileContents), 'utf-8')
}

const calculateNumEnsembles = async (
  bilbomdStep: BilboMDSteps,
  jobDir: string
): Promise<BilboMDSteps> => {
  let numEnsembles = 0

  // Define the results directory
  const resultsDir = path.join(jobDir, 'results')

  // Check if the results directory exists
  try {
    await fs.promises.access(resultsDir, fs.constants.F_OK)
  } catch {
    // Log as info since it's normal that the directory might not exist yet
    logger.info(`Results directory does not exist: ${resultsDir}`)
    return {
      ...bilbomdStep,
      numEnsembles: 0 // Return 0 if the results folder is missing
    }
  }

  // Proceed to scan the results directory if it exists
  try {
    const files = await fs.promises.readdir(resultsDir)
    const ensemblePdbFilePattern = /ensemble_size_\d+_model\.pdb$/
    const ensembleFiles = files.filter((file) =>
      ensemblePdbFilePattern.test(file)
    )
    numEnsembles = ensembleFiles.length // Number of ensemble files found
  } catch (error) {
    logger.error(`calculateNumEnsembles Error reading directory: ${error}`)
  }

  return {
    ...bilbomdStep,
    numEnsembles: numEnsembles
  }
}

const calculateNumEnsembles2 = async (
  jobDir: string
): Promise<{ numEnsembles: number; message?: string }> => {
  const dirToScan = path.join(jobDir, 'results')

  // Check if the results directory exists
  try {
    await fs.promises.access(dirToScan, fs.constants.F_OK)
  } catch {
    // Log as info since it's expected that the directory might not exist yet
    logger.info(`Results directory does not exist: ${dirToScan}`)
    return {
      numEnsembles: 0,
      message: 'Results directory not found yet.'
    }
  }

  // Proceed to scan the results directory if it exists
  try {
    const files = await fs.promises.readdir(dirToScan)
    const ensemblePdbFilePattern = /ensemble_size_\d+_model\.pdb$/
    const ensembleFiles = files.filter((file) =>
      ensemblePdbFilePattern.test(file)
    )
    const numEnsembles = ensembleFiles.length

    if (numEnsembles === 0) {
      return {
        numEnsembles: 0,
        message: 'No ensemble files found yet.'
      }
    }

    return {
      numEnsembles: numEnsembles
    }
  } catch (error) {
    logger.error(`calculateNumEnsembles2 Error reading directory: ${error}`)
    return {
      numEnsembles: 0,
      message: 'Error reading directory or no files found.'
    }
  }
}

const getFileStats = (filePath: string) => fs.statSync(filePath)

export {
  writeJobParams,
  sanitizeConstInpFile,
  calculateNumEnsembles,
  calculateNumEnsembles2,
  getFileStats
}
