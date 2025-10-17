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

  const movieScript = '/app/scripts/pymol/make_dcd_movie.py'

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

  // Build PyMOL command arguments
  const pymolArgs = [
    '-cqr', // command-line, quiet, no GUI
    movieScript,
    '--', // separator between PyMOL args and script args
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
  if (DBjob.const_inp_file) {
    const constraintsPath = path.join(outputDir, DBjob.const_inp_file)
    if (fs.existsSync(constraintsPath)) {
      pymolArgs.push(
        '--color-scheme',
        'constraints',
        '--config',
        DBjob.const_inp_file
      )
      logger.debug(`Using constraints file: ${constraintsPath}`)
    } else {
      logger.warn(
        `Constraints file specified but not found: ${constraintsPath}`
      )
    }
  }

  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)

  return new Promise((resolve, reject) => {
    // Create a bash command that activates conda environment and runs PyMOL
    const pythonBinary = '/opt/envs/openmm/bin/python'
    const pymolCommand = ['-m', 'pymol'].concat(pymolArgs)

    logger.debug(`Running command: ${pythonBinary} ${pymolCommand.join(' ')}`)
    logger.debug(`Working directory: ${outputDir}`)

    const movieProcess = spawn(pythonBinary, pymolCommand, {
      cwd: outputDir,
      env: {
        ...process.env,
        // Ensure the conda environment's bin directory is in PATH
        PATH: '/opt/envs/openmm/bin:' + process.env.PATH
      }
    })

    movieProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      logger.debug(`PyMOL stdout (${rgDir}): ${output.trim()}`)
      logStream.write(output)
    })

    movieProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      logger.debug(`PyMOL stderr (${rgDir}): ${output.trim()}`)
      errorStream.write(output)
    })

    movieProcess.on('error', (error: Error) => {
      logger.error(`Movie generation spawn error for ${dcdFile}: ${error}`)
      logStream.end()
      errorStream.end()
      reject(error)
    })

    movieProcess.on('exit', (code: number | null, signal: string | null) => {
      logStream.end()
      errorStream.end()

      if (code === 0) {
        logger.info(`Movie generated successfully for ${dcdFile}`)
        resolve()
      } else {
        logger.error(
          `Movie generation failed for ${dcdFile} with exit code ${code}, signal: ${signal}`
        )

        // Try to read error log for more details
        if (fs.existsSync(errorFile)) {
          try {
            const errorContent = fs.readFileSync(errorFile, 'utf8')
            if (errorContent.trim()) {
              logger.error(`Error log content for ${rgDir}: ${errorContent}`)
            }
          } catch (readError) {
            logger.error(`Could not read error log: ${readError}`)
          }
        }

        reject(new Error(`Movie generation failed with exit code ${code}`))
      }
    })
  })
}

export { runGenerateMovies, findDCDFiles, generateMovieFromDCD }
