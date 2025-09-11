import pLimit from 'p-limit'
import path from 'path'
import fs from 'fs-extra'
import csv from 'csv-parser'
import { logger } from '../../helpers/loggers.js'
import { glob } from 'glob'
import { promisify } from 'util'
import { IStepStatus } from '@bl1231/bilbomd-mongodb-schema'
import { IJob, IBilboMDSANSJob } from '@bl1231/bilbomd-mongodb-schema'
import { updateStepStatus } from './mongo-utils.js'
import { generateDCD2PDBInpFile } from './bilbomd-step-functions.js'
import { spawn, exec } from 'node:child_process'
import { makeDir, makeFile } from './job-utils.js'
import { config } from '../../config/config.js'
import { Job as BullMQJob } from 'bullmq'
import { spawnCharmm } from './job-utils.js'

const execPromise = promisify(exec)

interface FileCopyParams {
  source: string
  destination: string
  filename: string
  isCritical: boolean
}

interface CharmmDCD2PDBParams {
  out_dir: string
  charmm_template: string
  charmm_topo_dir: string
  charmm_inp_file: string
  charmm_out_file: string
  in_psf_file: string
  in_crd_file: string
  inp_basename: string
  pepsisans_rg: string
  in_dcd: string
  run: string
}

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

function isBilboMDSANSJob(job: IJob): job is IBilboMDSANSJob {
  return (job as IBilboMDSANSJob).d2o_fraction !== undefined
}

const copyFiles = async ({
  source,
  destination,
  filename,
  isCritical
}: FileCopyParams): Promise<void> => {
  try {
    await execPromise(`cp ${source} ${destination}`)
  } catch (error) {
    logger.error(`Error copying ${filename}: ${error}`)
    if (isCritical) {
      throw new Error(`Critical error copying ${filename}: ${error}`)
    }
  }
}

const writeSegidToChainid = async (inputFile: string): Promise<void> => {
  try {
    const fileContent = await fs.promises.readFile(inputFile, 'utf-8')
    const lines = fileContent.split('\n')
    const modifiedLines = lines.map((line) => {
      // Check if the line is an ATOM or HETATM line
      if (/^(ATOM|HETATM)/.test(line)) {
        // Extract the segid (columns 73-76)
        const segid = line.substring(72, 76).trim()
        const lastChar = segid.slice(-1)

        // Replace the chainid (column 22) with the last character of the segid
        return line.substring(0, 21) + lastChar + line.substring(22)
      } else {
        // If not an ATOM or HETATM line, return the line as is
        return line
      }
    })

    // Join the modified lines and overwrite the original file
    await fs.promises.writeFile(inputFile, modifiedLines.join('\n'), 'utf-8')
    // logger.info(`Processed PDB file saved as ${inputFile}`)
  } catch (error) {
    logger.error('Error processing the PDB file:', error)
  }
}

// Helper function to run a single Pepsi-SANS process for a given file
async function runPepsiSANSProcess(
  pepsiSansRunDir: string,
  file: string,
  pepsiSANSOpts: string[],
  MQjob: BullMQJob,
  index: number,
  total: number
): Promise<string> {
  const inputPath = path.join(pepsiSansRunDir, file)
  const outputFile = file.replace(/\.pdb$/, '.dat')
  const outputPath = path.join(pepsiSansRunDir, outputFile)

  return new Promise<string>((resolve, reject) => {
    const proc = spawn('Pepsi-SANS', [inputPath, '-o', outputPath, ...pepsiSANSOpts])

    proc.on('close', (code) => {
      if (code === 0) {
        if (MQjob && index % 20 === 0) {
          MQjob.updateProgress({
            status: `Pepsi-SANS ${index + 1}/${total}`,
            timestamp: Date.now()
          })
          MQjob.log(`Pepsi-SANS progress: ${index + 1}/${total}`)
          logger.info(`Pepsi-SANS progress: ${index + 1}/${total}`)
        }
        resolve(`${file},${outputFile},${path.basename(pepsiSansRunDir)}`)
      } else {
        reject(new Error(`Pepsi-SANS exited with code ${code} for ${file}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Pepsi-SANS process error for ${file}: ${err.message}`))
    })
  })
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
        runPepsiSANSProcess(pepsiSansRunDir, file, pepsiSANSOpts, MQjob, i, total)
      )
    )

    const results = await Promise.all(tasks)
    csvLines.push(...results)

    const csvFileName = `pepsisans_${path.basename(pepsiSansRunDir)}.csv`
    await fs.writeFile(path.join(pepsiSansRunDir, csvFileName), csvLines.join('\n'))

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
        combinedCSVContent.push(...lines.slice(1).filter((line) => line.trim() !== ''))
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
        number_generations: 5,
        ensemble_size: 2,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'Differential Evolution',
        cutoff_weight: 1e-6,
        fitness_function: 'inverse_absolute',
        parallel: true
      },
      {
        number_iterations: 5,
        number_generations: 5,
        ensemble_size: 3,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'Differential Evolution',
        cutoff_weight: 1e-6,
        fitness_function: 'inverse_absolute',
        parallel: true
      },
      {
        number_iterations: 5,
        number_generations: 5,
        ensemble_size: 4,
        ensemble_split: 0.85,
        crossover_probability: 0.5,
        mutation_probability: 0.15,
        fitting_algorithm: 'Differential Evolution',
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

const extractPDBFilesFromDCD = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)

  let status: IStepStatus = {
    status: 'Running',
    message: 'CHARMM Extract PDBs from DCD Trajectories has started.'
  }
  await updateStepStatus(DBjob, 'dcd2pdb', status)
  // Create the output directory for the PDB files
  const analysisDir = path.join(outputDir, 'pepsisans')
  await makeDir(analysisDir)
  // Create the output file for the Rg values from CHARMM
  const pepsisansRgFile = path.join(outputDir, 'pepsisans_rg.out')
  await makeFile(pepsisansRgFile)

  const step = Math.max(Math.round((DBjob.rg_max - DBjob.rg_min) / 5), 1)

  // Prepare Rg values array
  const rgValues: number[] = []
  for (let rg = DBjob.rg_min; rg <= DBjob.rg_max; rg += step) {
    rgValues.push(rg)
  }

  // Parallelize the outer loop (Rg loop) using Promise.all, process each Rg group sequentially
  await Promise.all(
    rgValues.map(async (rg) => {
      logger.info(`Starting CHARMM DCD extraction for Rg=${rg}`)
      for (let run = 1; run <= DBjob.conformational_sampling; run++) {
        const runLabel = `rg${rg}_run${run}`
        const pepsiSANSRunDir = path.join(analysisDir, runLabel)
        await makeDir(pepsiSANSRunDir)

        // Move DCD2PDBParams definition inside the loop to ensure unique scope per task
        const DCD2PDBParams: CharmmDCD2PDBParams = {
          out_dir: outputDir,
          charmm_template: 'dcd2pdb-sans',
          charmm_topo_dir: config.charmmTopoDir,
          charmm_inp_file: `dcd2pdb-sans_${runLabel}.inp`,
          charmm_out_file: `dcd2pdb-sans_${runLabel}.out`,
          in_psf_file: 'bilbomd_pdb2crd.psf',
          in_crd_file: '',
          inp_basename: `dcd2pdb-sans_${runLabel}`,
          pepsisans_rg: 'pepsisans_rg.out',
          in_dcd: '',
          run: runLabel
        }

        await generateDCD2PDBInpFile(DCD2PDBParams, rg, run)
        await spawnCharmm(DCD2PDBParams, MQjob)
      }
    })
  )

  status = {
    status: 'Success',
    message: 'CHARMM Extract PDBs from DCD Trajectories has completed.'
  }
  await updateStepStatus(DBjob, 'dcd2pdb', status)
  logger.info('PDB extraction completed.')
}

const remediatePDBFiles = async (DBjob: IBilboMDSANSJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const analysisDir = path.join(outputDir, 'pepsisans')
  let status: IStepStatus = {
    status: 'Running',
    message: 'Remediating PDB files has started.'
  }
  await updateStepStatus(DBjob, 'pdb_remediate', status)
  // Read all subdirectories in analysisDir
  const pepsiSANSRunDirs = fs.readdirSync(analysisDir).filter((file) => {
    return fs.statSync(path.join(analysisDir, file)).isDirectory()
  })

  for (const dir of pepsiSANSRunDirs) {
    const pepsiSANSRunDir = path.join(analysisDir, dir)

    // Read all PDB files in the current directory
    const pdbFiles = fs.readdirSync(pepsiSANSRunDir).filter((file) => {
      return file.endsWith('.pdb')
    })

    for (const pdbFile of pdbFiles) {
      const pdbFilePath = path.join(pepsiSANSRunDir, pdbFile)
      await writeSegidToChainid(pdbFilePath)
    }
  }
  status = {
    status: 'Success',
    message: 'Remediating PDB files has completed.'
  }
  await updateStepStatus(DBjob, 'pdb_remediate', status)
  logger.info('All PDB files have been remediated.')
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
    logger.error(`Error during Pepsi-SANS analysis: ${(error as Error).message}`)
    throw error // Re-throw after logging
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

const runGASANS = async (MQjob: BullMQJob, DBjob: IBilboMDSANSJob): Promise<void> => {
  const workingDir = path.join(config.uploadDir, DBjob.uuid)
  const gasansOpts = ['/app/scripts/sans/GASANS-dask.py']

  // Paths to log files
  const stdoutLog = path.join(workingDir, 'gasans.log')
  const stderrLog = path.join(workingDir, 'gasans-error.log')

  let status: IStepStatus = {
    status: 'Running',
    message: 'GA-SANS analysis has started.'
  }
  let heartbeat: NodeJS.Timeout | null = null
  try {
    // Update status to 'Running' at the start
    await updateStepStatus(DBjob, 'gasans', status)

    // Set up the heartbeat for monitoring
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: still running GA-SANS`)
        logger.info(
          `runGASANS Heartbeat: still running GA-SANS for: ${
            DBjob.title
          } at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
        )
      }, 10_000)
    }

    // Spawn the GASANS process
    const gasansProcess = spawn('/opt/envs/base/bin/python', gasansOpts, {
      cwd: workingDir
    })

    // Open write streams for stdout and stderr logs
    const stdoutStream = fs.createWriteStream(stdoutLog, { flags: 'a' })
    const stderrStream = fs.createWriteStream(stderrLog, { flags: 'a' })

    // Pipe stdout and stderr to their respective log files
    gasansProcess.stdout?.pipe(stdoutStream)
    gasansProcess.stderr?.pipe(stderrStream)

    // Handle process completion
    await new Promise<void>((resolve, reject) => {
      gasansProcess.on('close', (code) => {
        stdoutStream.close()
        stderrStream.close()

        if (code === 0) {
          logger.info(`GASANS process completed successfully. Exit code: ${code}`)
          resolve()
        } else {
          logger.error(`GASANS process exited with code ${code}`)
          reject(new Error(`GASANS process exited with code ${code}`))
        }
      })
    })

    // If the process completes successfully, update the status
    status = {
      status: 'Success',
      message: 'GA-SANS analysis has completed successfully.'
    }
    await updateStepStatus(DBjob, 'gasans', status)
  } catch (error) {
    // Update status to 'Error' if something goes wrong
    status = {
      status: 'Error',
      message: `GA-SANS analysis failed: ${(error as Error).message}`
    }
    await updateStepStatus(DBjob, 'gasans', status)
    logger.error(`Error during GASANS analysis: ${(error as Error).message}`)
    throw error
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

const prepareBilboMDSANSResults = async (DBjob: IBilboMDSANSJob): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'Gathering BilboMD SANS results has started.'
  }
  try {
    await updateStepStatus(DBjob, 'results', status)

    if (isBilboMDSANSJob(DBjob)) {
      await prepareResults(DBjob)
      status = {
        status: 'Success',
        message: 'Gathering BilboMD SANS results successful.'
      }
      await updateStepStatus(DBjob, 'results', status)
    } else {
      throw new Error('Invalid job type')
    }
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    status = {
      status: 'Error',
      message: 'Gathering BilboMD SANS results error.'
    }
    await updateStepStatus(DBjob, 'results', status)
    logger.error(`Error during prepareBilboMDResults job: ${errorMessage}`)
  }
}

const prepareResults = async (DBjob: IBilboMDSANSJob): Promise<void> => {
  try {
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const pepsisansDir = path.join(jobDir, 'pepsisans')
    const resultsDir = path.join(jobDir, 'results')

    // Create new empty results directory
    await makeDir(resultsDir)

    // Copy the minimized PDB
    await copyFiles({
      source: `${jobDir}/minimization_output.pdb`,
      destination: resultsDir,
      filename: 'minimization_output.pdb',
      isCritical: false
    })

    // Gather original uploaded files
    const filesToCopy = [
      { file: DBjob.data_file, label: 'data_file' },
      ...(DBjob.pdb_file ? [{ file: DBjob.pdb_file, label: 'pdb_file' }] : []),
      ...(DBjob.crd_file ? [{ file: DBjob.crd_file, label: 'crd_file' }] : []),
      ...(DBjob.psf_file ? [{ file: DBjob.psf_file, label: 'psf_file' }] : []),
      ...(DBjob.const_inp_file
        ? [{ file: DBjob.const_inp_file, label: 'const_inp_file' }]
        : [])
    ]

    // Gather GASANS ensemble Scattering Data CSV files
    const gasansCsvScatteringDataFiles = await glob('best_model_EnsembleSize*.csv', {
      cwd: jobDir
    })

    gasansCsvScatteringDataFiles.forEach((file) => {
      filesToCopy.push({ file, label: file })
    })

    // Gather GASANS ensemble summary CSV files
    const gasansSummaryFiles = await glob('gasans_summary_EnsSize*.csv', {
      cwd: jobDir
    })

    gasansSummaryFiles.forEach((file) => {
      filesToCopy.push({ file, label: file })
    })

    // Copy all files to the results directory
    for (const { file, label } of filesToCopy) {
      if (file) {
        await copyFiles({
          source: path.join(jobDir, file),
          destination: resultsDir,
          filename: label,
          isCritical: false
        })
      } else {
        logger.warn(`Expected file for '${label}' is undefined.`)
      }
    }

    // Catenate the "best" N-state ensemble PDB files
    for (const summaryFile of gasansSummaryFiles) {
      const ensembleNumber = summaryFile.match(/\d+/)?.[0] // Extract ensemble number
      logger.info(`Processing GASANS summary file for ensemble size ${ensembleNumber}`)
      if (!ensembleNumber) continue

      const summaryFilePath = path.join(jobDir, summaryFile)
      const csvData = await parseCsvFile(summaryFilePath)

      if (csvData.length === 0) {
        logger.warn(`No data found in ${summaryFile}`)
        continue
      }

      const bestEnsembleRow = csvData[0] // Get the first row of data (best ensemble)

      const pdbFilesToConcatenate: string[] = []
      const pdbNamePrefix = `PDBNAME_`
      const datDirectoryPrefix = `DAT_DIRECTORY_`

      for (let i = 1; i <= parseInt(ensembleNumber); i++) {
        const pdbFileName = bestEnsembleRow[`${pdbNamePrefix}${i}`]
        const datDirectory = bestEnsembleRow[`${datDirectoryPrefix}${i}`]

        if (pdbFileName && datDirectory) {
          const pdbFilePath = path.join(pepsisansDir, datDirectory, pdbFileName)
          pdbFilesToConcatenate.push(pdbFilePath)
        } else {
          logger.warn(
            `Missing PDB file or directory for ensemble size ${ensembleNumber}, index ${i}`
          )
        }
      }

      if (pdbFilesToConcatenate.length > 0) {
        const concatenatedPdbFile = path.join(
          resultsDir,
          `ensemble_size_${ensembleNumber}_model.pdb`
        )

        // Get the current date
        const currentDate = new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'short'
        }).format(new Date())

        // Generate the custom header
        const header = [
          `REMARK BilboMD SANS Best ${ensembleNumber}-State Ensemble`,
          `REMARK BilboMD Job UUID: ${DBjob.uuid}`,
          `REMARK Created on: ${currentDate}`,
          `REMARK This file was generated by concatenating the following PDB files:`,
          ...pdbFilesToConcatenate.map((filePath) => `REMARK ${filePath}`),
          `REMARK`
        ].join('\n')

        // Read and concatenate the content of all PDB files in memory
        const concatenatedContent = await Promise.all(
          pdbFilesToConcatenate.map((filePath) => fs.promises.readFile(filePath, 'utf-8'))
        ).then((contents) => contents.join('\n')) // Join all files' contents

        // Filter out lines starting with "REMARK"
        const filteredContent = concatenatedContent
          .split('\n')
          .filter((line) => !line.startsWith('REMARK'))
          .join('\n')

        // Combine the custom header and the filtered content
        const finalContent = [header, filteredContent].join('\n')

        // Write the final content to the output file
        await fs.promises.writeFile(concatenatedPdbFile, finalContent, 'utf-8')

        logger.info(
          `Created filtered PDB file with custom header: ${concatenatedPdbFile}`
        )
      }
    }

    // Create Job-specific README file
    await createReadmeFile(DBjob, gasansSummaryFiles.length, resultsDir)

    // Create the results tar.gz file
    const uuidPrefix = DBjob.uuid.split('-')[0]
    const archiveName = `results-${uuidPrefix}.tar.gz`
    await execPromise(`tar czvf ${archiveName} results`, { cwd: jobDir })
  } catch (error) {
    logger.error(`Error preparing results: ${error}`)
    throw error // Rethrow to handle further up the call stack if needed
  }
}

const parseCsvFile = (filePath: string): Promise<Record<string, string>[]> => {
  return new Promise((resolve, reject) => {
    const results: Record<string, string>[] = []

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error))
  })
}

const createReadmeFile = async (
  DBjob: IBilboMDSANSJob,
  numEnsembles: number,
  resultsDir: string
): Promise<void> => {
  const readmeContent = `
# BilboMD SANS Job Results

This directory contains the results for your ${DBjob.title} BilboMD SANS job.

- Job Title:  ${DBjob.title}
- Job ID:  ${DBjob._id}
- UUID:  ${DBjob.uuid}
- Submitted:  ${DBjob.time_submitted}
- Completed:  ${new Date().toString()}

## Contents

- Original PDB file: ${DBjob.pdb_file}
- Converted CRD file: ${DBjob.crd_file}
- Converted PSF file: ${DBjob.psf_file}
- Original experimental SANS data file: ${DBjob.data_file}
- Original const.inp file: ${DBjob.const_inp_file}
- Generated minimized PDB file: minimized_output.pdb
- Generated minimized PDB DAT file: minimized_output.pdb.dat

The "best" N-state Ensemble PDB files will be present in multiple copies. There is one file for each ensemble size.

- Number of ensembles for this BilboMD SANS run: ${numEnsembles}

- Ensemble PDB file(s):  ensemble_size_N_model.pdb
- Ensemble CSV file(s):  gasans_summary_EnsSizeN.csv
- Ensemble DAT/CSV file(s):  best_model_EnsembleSizeN.csv

### The ensemble_size_N_model.pdb files

These will be multi-model PDB files created by catenating the best ensemble of PDB files for each ensemble size.

ensemble_size_2_model.pdb  - will contain the coordinates for the best 2-state model
ensemble_size_3_model.pdb  - will contain the coordinates for the best 3-state model
ensemble_size_4_model.pdb  - will contain the coordinates for the best 4-state model
etc.

### The gasans_summary_EnsSizeN.csv files

TODO - Explain the contents of these CSV files

### The best_model_EnsembleSizeN.csv files

These are the theoretical SANS curves from Pepsi-SANS calculated for each of the ensemble_size_N_model.pdb models.

If you use BilboMD in your research, please cite:

Pelikan M, Hura GL, Hammel M. Structure and flexibility within proteins as identified through small angle X-ray scattering. Gen Physiol Biophys. 2009 Jun;28(2):174-89. doi: 10.4149/gpb_2009_02_174. PMID: ,19592714; PMCID: PMC3773563.

TODO - add citation for Pepsi-SANS
TODO - add citation for GA-SANS

Thank you for using BilboMD SANS
`
  const readmePath = path.join(resultsDir, 'README.md')
  try {
    await fs.writeFile(readmePath, readmeContent)
    logger.info('README file created successfully.')
  } catch (error) {
    logger.error('Failed to create README file:', error)
    throw new Error('Failed to create README file')
  }
}

export {
  extractPDBFilesFromDCD,
  remediatePDBFiles,
  runPepsiSANSOnPDBFiles,
  runGASANS,
  prepareBilboMDSANSResults
}
