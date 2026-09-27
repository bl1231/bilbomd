import pLimit from 'p-limit'
import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
import { IStepStatus, IBilboMDSANSJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { updateStepStatus } from './mongo-utils.js'

// Define the structure of the configuration JSON
interface GAInput {
  number_iterations: number
  number_generations: number
  ensemble_size: number
  ensemble_split: number
  crossover_probability: number
  mutation_probability: number
  fitting_algorithm: string
  cutoff_weight: number
  fitness_function: string
  parallel: boolean
}

interface Config {
  structurefile: string
  experiment: string
  max_ensemble_size: number
  GA_inputs: GAInput[]
}

// Helper function to run a single Pepsi-SANS process for a given file
const runPepsiSANSProcess = async (
  pepsiSansRunDir: string,
  file: string,
  pepsiSANSOpts: string[],
  MQjob: BullMQJob,
  index: number,
  total: number
): Promise<string> => {
  const inputPath = path.join(pepsiSansRunDir, file)
  const outputFile = file.replace(/\.pdb$/, '.dat')
  const outputPath = path.join(pepsiSansRunDir, outputFile)

  await runProcess({
    label: `Pepsi-SANS ${file}`,
    cmd: 'Pepsi-SANS',
    args: [inputPath, '-o', outputPath, ...pepsiSANSOpts],
    timeoutMs: config.processTimeouts.pepsiSansMs
  })

  if (MQjob && index % 20 === 0) {
    MQjob.updateProgress({
      status: `Pepsi-SANS ${index + 1}/${total}`,
      timestamp: Date.now()
    })
    MQjob.log(`Pepsi-SANS progress: ${index + 1}/${total}`)
    logger.info(`Pepsi-SANS progress: ${index + 1}/${total}`)
  }
  return `${file},${outputFile},${path.basename(pepsiSansRunDir)}`
}

const spawnPepsiSANS = async (
  pepsiSansRunDir: string,
  pepsiSANSOpts: string[],
  MQjob: BullMQJob
): Promise<void> => {
  try {
    logger.info(`Running Pepsi-SANS in ${pepsiSansRunDir}`)
    const allFiles = await fs.readdir(pepsiSansRunDir)
    const pdbFiles = allFiles.filter((f) => f.endsWith('.pdb'))
    const total = pdbFiles.length
    const csvLines = ['PDBNAME,SCATTERINGFILE,DAT_DIRECTORY']

    const concurrency = parseInt(process.env.PEPSISANS_CONCURRENCY || '3', 10)
    const limit = pLimit(concurrency)

    const tasks = pdbFiles.map((file, i) =>
      limit(() =>
        runPepsiSANSProcess(
          pepsiSansRunDir,
          file,
          pepsiSANSOpts,
          MQjob,
          i,
          total
        )
      )
    )

    const results = await Promise.all(tasks)
    csvLines.push(...results)

    const csvFileName = `pepsisans_${path.basename(pepsiSansRunDir)}.csv`
    await fs.writeFile(
      path.join(pepsiSansRunDir, csvFileName),
      csvLines.join('\n')
    )

    logger.info(`Pepsi-SANS processing complete. ${csvFileName} created.`)
  } catch (error) {
    logger.error(
      `An error occurred during Pepsi-SANS processing: ${(error as Error).message}`
    )
    throw error
  }
}

const combineCSVFiles = async (
  pepsiSANSRunDirs: string[],
  outDir: string,
  outputFileName: string
): Promise<void> => {
  const combinedCSVContent: string[] = []
  let headerWritten = false // Track if the header has been written

  for (const dir of pepsiSANSRunDirs) {
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (file.endsWith('.csv')) {
        const filePath = path.join(dir, file)
        const fileContent = await fs.readFile(filePath, 'utf-8')
        const lines = fileContent.split('\n')

        if (!headerWritten) {
          // Write the header from the first CSV file
          combinedCSVContent.push(lines[0]) // Add the header line
          headerWritten = true
        }

        // Add the data lines (excluding the header line)
        combinedCSVContent.push(
          ...lines.slice(1).filter((line) => line.trim() !== '')
        )
      }
    }
  }

  const outputFilePath = path.join(outDir, outputFileName)
  await fs.writeFile(outputFilePath, combinedCSVContent.join('\n'), 'utf-8')
  logger.info(`Combined CSV file written to ${outputFilePath}`)
}

const writeConfigFile = async (
  pepsiSANScombinedCsv: string,
  experiment: string,
  outDir: string,
  outputFileName: string
): Promise<void> => {
  const config: Config = {
    structurefile: pepsiSANScombinedCsv,
    experiment: experiment,
    max_ensemble_size: 4,
    GA_inputs: [
      {
        number_iterations: 5,
        number_generations: 50,
        ensemble_size: 2,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'nelder',
        cutoff_weight: 1e-6,
        fitness_function: 'inverse_absolute',
        parallel: true
      },
      {
        number_iterations: 5,
        number_generations: 50,
        ensemble_size: 3,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'nelder',
        cutoff_weight: 1e-6,
        fitness_function: 'inverse_absolute',
        parallel: true
      },
      {
        number_iterations: 5,
        number_generations: 50,
        ensemble_size: 4,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'nelder',
        cutoff_weight: 1e-6,
        fitness_function: 'inverse_absolute',
        parallel: true
      }
    ]
  }

  // Define the output file path
  const outputFilePath = path.join(outDir, outputFileName)

  // Convert the configuration object to JSON and write it to the file
  await fs.writeFile(outputFilePath, JSON.stringify(config, null, 2), 'utf-8')
  logger.info(`Configuration file written to ${outputFilePath}`)
}

const runPepsiSANSOnPDBFiles = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  const workingDir = path.join(config.uploadDir, DBjob.uuid)
  const analysisDir = path.join(workingDir, 'pepsisans')
  let heartbeat: NodeJS.Timeout | null = null
  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'Pepsi-SANS analysis has started.'
    }
    await updateStepStatus(DBjob, 'pepsisans', status)

    // Read all subdirectories in analysisDir
    const files = await fs.readdir(analysisDir)
    const pepsiSANSRunDirs = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(analysisDir, file)
        const stats = await fs.stat(filePath)
        return stats.isDirectory() ? filePath : null
      })
    )

    // Filter out nulls (non-directory entries)
    const validDirs = pepsiSANSRunDirs.filter((dir) => dir !== null) as string[]

    // Set up the heartbeat for monitoring
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: still running Pepsi-SANS`)
        logger.info(
          `runPepsiSANSOnPDBFiles Heartbeat: still running for: ${
            DBjob.title
          } at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
        )
      }, 10_000)
    }

    // -ms <max angle>,  --maximum_scattering_vector <max angle>
    //  Maximum scattering vector in inverse Angstroms (max = 1.0 A-1),
    //  default is 0.5 A-1
    // -ns <number of points>,  --number_of_points <number of points>
    //  Number of points in the scattering curve if experimental data is not
    //  provided, default 101, max 5000
    // --deut <Molecule deuteration>
    //  Molecule deuteration
    // --d2o <Buffer deuteration>
    //  Buffer deuteration
    // --deuterated <Deuterateed chains' IDs>
    //  IDs of deuterated chains, single string. If omitted, everyhing is
    //  assumed deuterated.

    // Pepsi-SANS options
    const pepsiSANSOpts = [
      '-ms',
      '0.5',
      '-ns',
      '501',
      '--d2o',
      (DBjob.d2o_fraction / 100).toFixed(2)
    ]

    // Process each directory in parallel
    const allPepsiSANSJobs = validDirs.map((pepsiSANSRunDir) =>
      spawnPepsiSANS(pepsiSANSRunDir, pepsiSANSOpts, MQjob)
    )
    // Wait for all Pepsi-SANS jobs to complete
    await Promise.all(allPepsiSANSJobs)

    // Combine all CSV files into a single CSV file.
    await combineCSVFiles(validDirs, workingDir, 'pepsisans_combined.csv')

    // Write a gasans_config.json file
    await writeConfigFile(
      'pepsisans_combined.csv',
      DBjob.data_file,
      workingDir,
      'gasans_config.json'
    )
    status = {
      status: 'Success',
      message: 'Pepsi-SANS analysis has completed.'
    }
    await updateStepStatus(DBjob, 'pepsisans', status)
    logger.info('Pepsi-SANS analysis completed.')
  } catch (error) {
    logger.error(
      `Error during Pepsi-SANS analysis: ${(error as Error).message}`
    )
    throw error // Re-throw after logging
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

export { runPepsiSANSOnPDBFiles, spawnPepsiSANS }
