import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { spawn } from 'node:child_process'
import { promisify } from 'util'
import fs from 'fs-extra'
import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import {
  IStepStatus,
  IBilboMDPDBJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob
} from '@bilbomd/mongodb-schema'
import { exec } from 'node:child_process'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './bilbomd-step-functions.js'

const execPromise = promisify(exec)

const runGenerateMovies = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDAutoJob | IBilboMDPDBJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  logger.debug(`Starting runGenerateMovies for job ${DBjob.uuid}`)

  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'Movie generation has started.'
    }
    await updateStepStatus(DBjob, 'movies', status)

    const outputDir = path.join(config.uploadDir, DBjob.uuid)

    // Find all DCD files in the MD output directories
    const dcdFiles = await findDCDFiles(outputDir)

    if (dcdFiles.length === 0) {
      logger.warn(`No DCD files found for movie generation in ${outputDir}`)
      status = {
        status: 'Success',
        message: 'No DCD files found for movie generation.'
      }
      await updateStepStatus(DBjob, 'movies', status)
      return
    }

    // Generate movies in parallel for each DCD file
    const movieTasks = dcdFiles.map((dcdFile) =>
      generateMovieFromDCD(outputDir, dcdFile, DBjob)
    )

    await Promise.all(movieTasks)

    status = {
      status: 'Success',
      message: `Generated ${dcdFiles.length} movies successfully.`
    }
    await updateStepStatus(DBjob, 'movies', status)
    logger.debug(
      `runGenerateMovies completed successfully for job ${DBjob.uuid}`
    )
  } catch (error) {
    logger.error(`runGenerateMovies failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, MQjob, DBjob, 'movies')
  }
}

const findDCDFiles = async (outputDir: string): Promise<string[]> => {
  try {
    const mdDir = path.join(outputDir, 'md')

    // Check if md directory exists
    if (!fs.existsSync(mdDir)) {
      logger.warn(`MD directory not found: ${mdDir}`)
      return []
    }

    // Look for md.dcd files in rg_* subdirectories
    const { stdout } = await execPromise('find . -name "rg_*" -type d', {
      cwd: mdDir
    })

    const rgDirs = stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.replace('./', ''))

    // Check each rg directory for md.dcd file
    const dcdFiles: string[] = []
    for (const rgDir of rgDirs) {
      const dcdPath = path.join('md', rgDir, 'md.dcd')
      const fullDcdPath = path.join(outputDir, dcdPath)

      if (fs.existsSync(fullDcdPath)) {
        dcdFiles.push(dcdPath)
        logger.debug(`Found DCD file: ${dcdPath}`)
      } else {
        logger.warn(`Expected DCD file not found: ${dcdPath}`)
      }
    }

    return dcdFiles
  } catch (error) {
    logger.error(`Error finding DCD files: ${error}`)
    return []
  }
}

const generateMovieFromDCD = async (
  outputDir: string,
  dcdFile: string,
  DBjob: IBilboMDAutoJob | IBilboMDPDBJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  // Extract Rg directory name from dcdFile path (e.g., "md/rg_26/md.dcd" -> "rg_26")
  const rgDir = path.dirname(dcdFile).split('/').pop()

  const logFile = path.join(outputDir, `movie_${rgDir}.log`)
  const errorFile = path.join(outputDir, `movie_${rgDir}_error.log`)

  const movieScript = '/app/scripts/make_dcd_movie.py'

  // The corresponding PDB file should be in the same directory as the DCD
  const pdbFile = path.join(path.dirname(dcdFile), 'md.pdb')
  const fullPdbPath = path.join(outputDir, pdbFile)

  // Verify PDB file exists
  if (!fs.existsSync(fullPdbPath)) {
    throw new Error(`Required PDB file not found: ${pdbFile}`)
  }

  // Create movies directory if it doesn't exist
  const moviesDir = path.join(outputDir, 'movies')
  await fs.ensureDir(moviesDir)

  // Guard around constraints file - only use if it exists
  let mdConstraintsFile: string | undefined
  if (DBjob.const_inp_file) {
    const constraintsPath = path.join(outputDir, DBjob.const_inp_file)
    if (fs.existsSync(constraintsPath)) {
      mdConstraintsFile = constraintsPath
      logger.debug(`Using constraints file: ${mdConstraintsFile}`)
    } else {
      logger.warn(
        `Constraints file specified but not found: ${constraintsPath}`
      )
    }
  }

  const movieScriptArgs = [
    '-cqr',
    movieScript,
    '--',
    '--pdb',
    pdbFile,
    '--dcd',
    dcdFile,
    '--out',
    path.join('movies', `${rgDir}.mp4`),
    '--align-ca',
    '--orient',
    'principal',
    '--clip',
    '--viewport',
    '--stride',
    '4',
    '--ray'
  ]

  // Add constraints file and color scheme if available
  if (mdConstraintsFile) {
    movieScriptArgs.push(
      '--color-scheme',
      'constraints',
      '--config',
      mdConstraintsFile
    )
  }

  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)

  return new Promise((resolve, reject) => {
    const movieProcess = spawn('pymol', movieScriptArgs, {
      cwd: outputDir
    })

    movieProcess.stdout?.on('data', (data: Buffer) => {
      logStream.write(data.toString())
    })

    movieProcess.stderr?.on('data', (data: Buffer) => {
      errorStream.write(data.toString())
    })

    movieProcess.on('error', (error: Error) => {
      logger.error(`Movie generation error for ${dcdFile}: ${error}`)
      logStream.end()
      errorStream.end()
      reject(error)
    })

    movieProcess.on('exit', (code: number | null) => {
      logStream.end()
      errorStream.end()

      if (code === 0) {
        logger.info(`Movie generated successfully for ${dcdFile}`)
        resolve()
      } else {
        logger.error(
          `Movie generation failed for ${dcdFile} with exit code ${code}`
        )
        reject(new Error(`Movie generation failed with exit code ${code}`))
      }
    })
  })
}

export { runGenerateMovies, findDCDFiles, generateMovieFromDCD }
