import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { spawn, ChildProcess } from 'node:child_process'
import { promisify } from 'util'
import fs from 'fs-extra'
import os from 'os'
import readline from 'node:readline'
import path from 'path'
import YAML from 'yaml'
import { convertInpToYaml, validateYamlConstraints } from '@bilbomd/md-utils'
import { Job as BullMQJob } from 'bullmq'
import {
  IBilboMDSteps,
  IStepStatus,
  IUser,
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDSANSJob,
  IMDConstraints
} from '@bilbomd/mongodb-schema'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { exec } from 'node:child_process'
import {
  createPdb2CrdCharmmInpFiles,
  spawnPdb2CrdCharmm
} from '../pipelines/pdb-to-crd.js'
import {
  CharmmParams,
  MultiFoxsParams,
  PaeParams,
  CharmmHeatParams,
  CharmmMDParams,
  FileCopyParams
} from '../../types/index.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  makeDir,
  generateDCD2PDBInpFile,
  generateInputFile,
  spawnCharmm
} from './job-utils.js'

type JobStatusEnum = 'Submitted' | 'Pending' | 'Running' | 'Completed' | 'Error'

const execPromise = promisify(exec)

const handleError = async (
  error: Error | unknown,
  MQjob: BullMQJob,
  DBjob: IJob,
  step?: keyof IBilboMDSteps
) => {
  // Enhanced error message extraction
  let errorMsg: string
  let stackTrace: string | undefined

  if (error instanceof Error) {
    errorMsg = error.message
    stackTrace = error.stack
    logger.error(
      `handleError - Error object details: name=${error.name}, message=${error.message}, stack=${error.stack}, step=${step || 'unknown'}`
    )
  } else {
    errorMsg = String(error)
    logger.error(
      `handleError - Non-Error object: error=${error}, type=${typeof error}, step=${step || 'unknown'}`
    )
  }

  // Log the step and error details
  logger.error(
    `handleError called for step: ${step || 'undefined'} with error: ${errorMsg}`
  )

  if (stackTrace) {
    logger.error(`Stack trace: ${stackTrace}`)
  }

  // Log job details for context
  logger.error(
    `Job context: jobId=${DBjob.id}, jobUuid=${DBjob.uuid}, jobTitle=${DBjob.title}, jobType=${DBjob.__t}, currentStatus=${DBjob.status}, mqJobId=${MQjob.id}, mqJobName=${MQjob.name}, attemptsMade=${MQjob.attemptsMade}`
  )

  try {
    // Updates primary status in MongoDB
    logger.debug(`Updating job status to 'Error' for job ${DBjob.id}`)
    await updateJobStatus(DBjob, 'Error')
    logger.debug(`Successfully updated job status to 'Error'`)
  } catch (updateError) {
    logger.error(`Failed to update job status: ${updateError}`)
  }

  // Update the specific step status
  if (step) {
    try {
      const status: IStepStatus = {
        status: 'Error',
        message: `Error in step ${step}: ${errorMsg}`
      }
      logger.debug(`Updating step status for step: ${step}`)
      await updateStepStatus(DBjob, step, status)
      logger.debug(`Successfully updated step status for step: ${step}`)
    } catch (stepUpdateError) {
      logger.error(
        `Failed to update step status for step ${step}: ${stepUpdateError}`
      )
    }
  } else {
    logger.error(`Step not provided when handling error. Error: ${errorMsg}`)
  }

  // Log to MQ job
  try {
    await MQjob.log(`ERROR: ${errorMsg}`)
    if (stackTrace) {
      await MQjob.log(`Stack trace: ${stackTrace}`)
    }
    logger.debug(`Successfully logged error to MQ job`)
  } catch (mqLogError) {
    logger.error(`Failed to log to MQ job: ${mqLogError}`)
  }

  // Send job completion email and log the notification
  logger.info(`Failed Attempts: ${MQjob.attemptsMade}`)

  try {
    const recipientEmail = (DBjob.user as IUser).email
    logger.debug(`Recipient email: ${recipientEmail}`)

    if (MQjob.attemptsMade >= 3) {
      if (config.sendEmailNotifications) {
        logger.debug(`Sending failure email notification to ${recipientEmail}`)
        await sendJobCompleteEmail(
          recipientEmail,
          config.bilbomdUrl,
          DBjob.id,
          DBjob.title,
          true
        )
        logger.warn(`Email notification sent to ${recipientEmail}`)
        await MQjob.log(`Email notification sent to ${recipientEmail}`)
      } else {
        logger.debug(`Email notifications are disabled`)
      }
    } else {
      logger.debug(`Not sending email - attempts (${MQjob.attemptsMade}) < 3`)
    }
  } catch (emailError) {
    logger.error(`Failed to send email notification: ${emailError}`)
  }

  // Create a more descriptive error to throw
  const finalError = new Error(
    `BilboMD failed in step '${step || 'unknown'}': ${errorMsg}`
  )
  logger.error(`Throwing final error: ${finalError.message}`)
  throw finalError
}

const updateJobStatus = async (
  job: IJob,
  status: JobStatusEnum
): Promise<void> => {
  job.status = status
  await job.save()
}

const makeFoxsDatFileList = async (dir: string) => {
  const stdOut = path.join(dir, 'foxs_dat_files.txt')
  const stdErr = path.join(dir, 'foxs_dat_files_errors.txt')
  const stdoutStream = fs.createWriteStream(stdOut)
  const errorStream = fs.createWriteStream(stdErr)

  try {
    const { stdout, stderr } = await execPromise('ls -1 ../foxs/*/*.pdb.dat', {
      cwd: dir
    })

    // Use 'end' to ensure the stream is closed after writing
    stdoutStream.end(stdout)
    errorStream.end(stderr)

    // Wait for both streams to finish writing and closing
    await Promise.all([
      new Promise<void>((resolve, reject) =>
        stdoutStream
          .on('finish', () => resolve())
          .on('error', (err) => reject(err))
      ),
      new Promise<void>((resolve, reject) =>
        errorStream
          .on('finish', () => resolve())
          .on('error', (err) => reject(err))
      )
    ])
  } catch (error) {
    logger.error(`Error generating foxs_dat_files list ${error}`)
    // It's important to close the streams even in case of an error to free up the resources
    stdoutStream.end()
    errorStream.end()
  }
}

const getNumEnsembles = async (logFile: string): Promise<number> => {
  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity
  })
  const regex = /(?:number_of_states[ ])([\d]+)/
  const ensembleCount = ['0']
  for await (const line of rl) {
    const found = line.match(regex)
    if (found !== null) {
      ensembleCount.push(found[1])
    }
  }
  return Number(ensembleCount.pop())
}

const extractPdbPaths = (content: string): string[] => {
  const lines = content.split('\n')
  const pdbPaths = lines
    .filter((line) => line.includes('.pdb.dat'))
    .map((line) => {
      const match = line.match(/(\/[^|]+\.pdb.dat)/)
      if (match) {
        const fullPath = match[1]
        // Remove the .dat extension from the filename
        const filename = fullPath.replace(/\.dat$/, '')
        return filename
      }
      return ''
    })
  // Extracts all PDBs
  //
  // logger.info(`extractPdbPaths pdbPaths: ${pdbPaths}`)
  return pdbPaths
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

const spawnMultiFoxs = (params: MultiFoxsParams): Promise<void> => {
  const multiFoxsDir = path.join(params.out_dir, 'multifoxs')
  const logFile = path.join(multiFoxsDir, 'multi_foxs.log')
  const errorFile = path.join(multiFoxsDir, 'multi_foxs_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const saxsData = path.join(params.out_dir, params.data_file)
  const multiFoxArgs = ['-o', saxsData, 'foxs_dat_files.txt']
  const multiFoxOpts = { cwd: multiFoxsDir }

  return new Promise((resolve, reject) => {
    const multiFoxs: ChildProcess = spawn(
      config.multifoxsBin,
      multiFoxArgs,
      multiFoxOpts
    )
    multiFoxs.stdout?.on('data', (data) => {
      logStream.write(data.toString())
    })
    multiFoxs.stderr?.on('data', (data) => {
      errorStream.write(data.toString())
    })
    multiFoxs.on('error', (error) => {
      logger.error(`spawnMultiFoxs error: ${error}`)
      reject(error)
    })
    multiFoxs.on('exit', (code: number) => {
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]
      Promise.all(closeStreamsPromises)
        .then(() => {
          if (code === 0) {
            logger.info(`spawnMultiFoxs close success exit code: ${code}`)
            resolve()
          } else {
            logger.info(`spawnMultiFoxs close error exit code: ${code}`)
            reject(`spawnMultiFoxs on close reject`)
          }
        })
        .catch((streamError) => {
          logger.error(`Error closing file streams: ${streamError}`)
          reject(streamError)
        })
    })
  })
}

const spawnPaeToConst = async (params: PaeParams): Promise<string> => {
  logger.debug(
    `spawnPaeToConst starting with params: in_crd=${params.in_crd}, in_pdb=${params.in_pdb}, in_pae=${params.in_pae}, out_dir=${params.out_dir}, plddt_cutoff=${params.plddt_cutoff}, emit_constraints=${params.emit_constraints}, no_const=${params.no_const}, python_bin=${params.python_bin}, script_path=${params.script_path}`
  )

  // Basic validation of inputs with preference logic
  const hasCRD = Boolean(params.in_crd)
  const hasPDB = Boolean(params.in_pdb)
  logger.debug(`Input validation: hasCRD=${hasCRD}, hasPDB=${hasPDB}`)

  // If neither file is provided, throw an error
  if (!hasCRD && !hasPDB) {
    const errorMsg = 'At least one of in_crd or in_pdb must be provided'
    logger.error(`Validation failed: ${errorMsg}`)
    throw new Error(errorMsg)
  }

  // If both files are provided, prefer PDB and log the decision
  if (hasCRD && hasPDB) {
    logger.debug(
      `Both CRD and PDB files provided, preferring PDB file: ${params.in_pdb}`
    )
    // Clear the CRD parameter to ensure PDB is used
    params.in_crd = undefined
  }

  // Ensure output dir exists (no-op if it already does)
  try {
    logger.debug(`Creating output directory: ${params.out_dir}`)
    fs.mkdirSync(params.out_dir, { recursive: true })
    logger.debug(`Output directory created/verified successfully`)
  } catch (error) {
    logger.error(`Failed to create output directory: ${error}`)
    throw error
  }

  const logFile = path.join(params.out_dir, 'af2pae.log')
  const errorFile = path.join(params.out_dir, 'af2pae_error.log')
  logger.debug(`Log files: stdout=${logFile}, stderr=${errorFile}`)

  let logStream: fs.WriteStream
  let errorStream: fs.WriteStream

  try {
    logStream = fs.createWriteStream(logFile, { flags: 'a' })
    errorStream = fs.createWriteStream(errorFile, { flags: 'a' })
    logger.debug(`Log streams created successfully`)
  } catch (error) {
    logger.error(`Failed to create log streams: ${error}`)
    throw error
  }

  const pythonBin = params.python_bin ?? '/opt/envs/base/bin/python'
  const af2paeScript = params.script_path ?? '/app/scripts/pae2const.py'
  logger.debug(`Python binary: ${pythonBin}`)
  logger.debug(`Script path: ${af2paeScript}`)

  // Verify script exists
  try {
    await fs.access(af2paeScript)
    logger.debug(`Script file verified: ${af2paeScript}`)
  } catch (error) {
    logger.error(
      `Script file not found or not accessible: ${af2paeScript} - ${error}`
    )
    throw new Error(`Script file not found: ${af2paeScript}`)
  }

  // Verify input files exist
  if (hasCRD && params.in_crd) {
    const crdPath = path.join(params.out_dir, params.in_crd)
    try {
      await fs.access(crdPath)
      logger.debug(`CRD file verified: ${crdPath}`)
    } catch (error) {
      logger.error(`CRD file not found: ${crdPath} - ${error}`)
      throw new Error(`CRD file not found: ${crdPath}`)
    }
  }

  if (hasPDB && params.in_pdb) {
    const pdbPath = path.join(params.out_dir, params.in_pdb)
    try {
      await fs.access(pdbPath)
      logger.debug(`PDB file verified: ${pdbPath}`)
    } catch (error) {
      logger.error(`PDB file not found: ${pdbPath} - ${error}`)
      throw new Error(`PDB file not found: ${pdbPath}`)
    }
  }

  const paePath = path.join(params.out_dir, params.in_pae)
  try {
    await fs.access(paePath)
    logger.debug(`PAE file verified: ${paePath}`)
  } catch (error) {
    logger.error(`PAE file not found: ${paePath} - ${error}`)
    throw new Error(`PAE file not found: ${paePath}`)
  }

  // Build CLI args per new usage - ensure we have exactly one file after preference logic
  let fileFlag: string[]

  if (params.in_crd && !params.in_pdb) {
    fileFlag = ['--crd_file', params.in_crd]
  } else if (!params.in_crd && params.in_pdb) {
    fileFlag = ['--pdb_file', params.in_pdb]
  } else {
    throw new Error(
      'Exactly one of in_crd or in_pdb must be provided after preference logic.'
    )
  }

  logger.debug(`File flag: ${JSON.stringify(fileFlag)}`)

  const optionalFlags: string[] = []
  if (params.plddt_cutoff !== undefined) {
    optionalFlags.push('--plddt_cutoff', String(params.plddt_cutoff))
  }
  if (params.emit_constraints) {
    optionalFlags.push('--openmm-const-file', 'openmm_const.yml')
  }
  if (params.no_const) {
    optionalFlags.push('--no-const')
  }
  logger.debug(`Optional flags: ${JSON.stringify(optionalFlags)}`)

  const args = [af2paeScript, ...fileFlag, ...optionalFlags, params.in_pae]
  logger.debug(`Full command args: ${JSON.stringify(args)}`)

  const opts = { cwd: params.out_dir }
  logger.debug(`Spawn options: ${JSON.stringify(opts)}`)

  // Log the full command that would be executed
  logger.debug(`Full command: ${pythonBin} ${args.join(' ')}`)
  logger.debug(`Working directory: ${opts.cwd}`)

  return new Promise((resolve, reject) => {
    logger.debug(`Starting spawn process...`)

    let runPaeToConst: ChildProcess
    try {
      runPaeToConst = spawn(pythonBin, args, opts)
      logger.debug(`Process spawned successfully, PID: ${runPaeToConst.pid}`)
    } catch (spawnError) {
      logger.error(`Failed to spawn process: ${spawnError}`)
      // Close streams before rejecting
      Promise.all([
        new Promise((r) => logStream.end(r)),
        new Promise((r) => errorStream.end(r))
      ]).finally(() => reject(spawnError))
      return
    }

    // Set up timeout to detect hanging processes
    const processTimeout = setTimeout(
      () => {
        logger.error(`Process timeout after 5 minutes, killing process`)
        runPaeToConst.kill('SIGKILL')
      },
      5 * 60 * 1000
    ) // 5 minutes

    runPaeToConst.stdout?.on('data', (data) => {
      const s = data.toString()
      logger.debug(
        `runPaeToConst stdout chunk (${s.length} chars): ${s.substring(0, 200)}${s.length > 200 ? '...' : ''}`
      )
      try {
        logStream.write(s)
      } catch (writeError) {
        logger.error(`Failed to write to log stream: ${writeError}`)
      }
    })

    runPaeToConst.stderr?.on('data', (data) => {
      const s = data.toString()
      logger.debug(
        `runPaeToConst stderr chunk (${s.length} chars): ${s.substring(0, 200)}${s.length > 200 ? '...' : ''}`
      )
      logger.error(`runPaeToConst stderr: ${s}`)
      try {
        errorStream.write(s)
      } catch (writeError) {
        logger.error(`Failed to write to error stream: ${writeError}`)
      }
    })

    runPaeToConst.on('error', (error) => {
      clearTimeout(processTimeout)
      logger.error(
        `runPaeToConst process error: error=${(error as Error).message}, code=${(error as NodeJS.ErrnoException).code}, errno=${(error as NodeJS.ErrnoException).errno}, syscall=${(error as NodeJS.ErrnoException).syscall}, path=${(error as NodeJS.ErrnoException).path}`
      )

      // ensure streams are closed before rejecting
      Promise.all([
        new Promise((r) => {
          try {
            logStream.end(r)
          } catch (e) {
            logger.error(`Error closing log stream: ${e}`)
            r(undefined)
          }
        }),
        new Promise((r) => {
          try {
            errorStream.end(r)
          } catch (e) {
            logger.error(`Error closing error stream: ${e}`)
            r(undefined)
          }
        })
      ]).finally(() => {
        logger.debug(`Streams closed, rejecting with error`)
        reject(error)
      })
    })

    runPaeToConst.on('exit', (code: number | null, signal: string | null) => {
      clearTimeout(processTimeout)
      logger.debug(
        `runPaeToConst process exited with code: ${code}, signal: ${signal}`
      )

      const closeStreams = Promise.all([
        new Promise((r) => {
          try {
            logStream.end(r)
          } catch (e) {
            logger.error(`Error closing log stream on exit: ${e}`)
            r(undefined)
          }
        }),
        new Promise((r) => {
          try {
            errorStream.end(r)
          } catch (e) {
            logger.error(`Error closing error stream on exit: ${e}`)
            r(undefined)
          }
        })
      ])

      closeStreams
        .then(() => {
          logger.debug(`Streams closed successfully`)
          if (code === 0) {
            logger.debug(
              `runPaeToConst completed successfully with exit code: ${code}`
            )
            resolve(String(code))
          } else {
            logger.error(
              `runPaeToConst failed with exit code: ${code}, signal: ${signal}`
            )
            reject(
              new Error(
                `runPaeToConst failed with exit code ${code}${signal ? ` and signal ${signal}` : ''}. Please see the error log file: ${errorFile}`
              )
            )
          }
        })
        .catch((streamError) => {
          logger.error(`Error closing file streams: ${streamError}`)
          reject(streamError)
        })
    })

    runPaeToConst.on('close', (code: number | null, signal: string | null) => {
      logger.debug(
        `runPaeToConst process closed with code: ${code}, signal: ${signal}`
      )
    })

    // Additional debugging for process state
    if (runPaeToConst.pid) {
      logger.debug(`Process started with PID: ${runPaeToConst.pid}`)
    } else {
      logger.warn(`Process started but no PID available`)
    }
  })
}

const storeConstraintsInMongoDB = async (
  DBjob: IBilboMDAutoJob,
  filePath: string,
  fileName: string
): Promise<void> => {
  try {
    logger.debug(`Storing constraints in MongoDB from file: ${filePath}`)

    let constraints: IMDConstraints

    if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
      // Parse YAML constraints for OpenMM
      logger.debug('Processing YAML constraints file for OpenMM')

      // Validate the YAML file first
      await validateYamlConstraints(filePath, logger)

      // Parse and store the YAML constraints
      const fileContent = await fs.readFile(filePath, 'utf8')
      constraints = YAML.parse(fileContent) as IMDConstraints
      logger.debug(
        `Parsed YAML constraints: ${JSON.stringify(constraints, null, 2)}`
      )
    } else if (fileName === 'const.inp') {
      // For CHARMM const.inp, convert it to YAML format first, then parse
      logger.debug('Converting CHARMM const.inp to YAML format')

      // Convert INP to YAML using the shared utility
      const yamlContent = await convertInpToYaml(filePath, logger)

      // Parse the converted YAML into constraints object
      constraints = YAML.parse(yamlContent) as IMDConstraints
      logger.debug(
        `Converted and parsed CHARMM constraints: ${JSON.stringify(constraints, null, 2)}`
      )
    } else {
      throw new Error(`Unsupported constraint file format: ${fileName}`)
    }

    // Use type assertion to access md_constraints property
    ;(DBjob as IJob & { md_constraints?: IMDConstraints }).md_constraints =
      constraints

    await DBjob.save()
    logger.debug(
      `Successfully stored constraints in MongoDB for job ${DBjob.uuid}`
    )
  } catch (error) {
    logger.error(`Error storing constraints in MongoDB: ${error}`)
    throw error
  }
}

const runPdb2Crd = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDPDBJob | IBilboMDSANSJob
): Promise<void> => {
  logger.debug(`Starting runPdb2Crd for job ${DBjob.uuid}`)
  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'PDB2CRD has started.'
    }
    await updateStepStatus(DBjob, 'pdb2crd', status)

    let charmmInpFiles: string[] = []

    logger.debug(`Creating PDB2CRD CHARMM input files`)
    charmmInpFiles = await createPdb2CrdCharmmInpFiles({
      uuid: DBjob.uuid,
      pdb_file: DBjob.pdb_file
    })
    logger.debug(
      `Created CHARMM input files: ${JSON.stringify(charmmInpFiles)}`
    )

    // CHARMM pdb2crd convert individual chains
    logger.debug(`Running CHARMM pdb2crd for individual chains`)
    await spawnPdb2CrdCharmm(MQjob, charmmInpFiles)

    // CHARMM pdb2crd meld individual crd files
    logger.debug(`Running CHARMM pdb2crd meld step`)
    charmmInpFiles = ['pdb2crd_charmm_meld.inp']
    await spawnPdb2CrdCharmm(MQjob, charmmInpFiles)

    // Update MongoDB
    logger.debug(`Updating job files in database`)
    DBjob.psf_file = 'bilbomd_pdb2crd.psf'
    DBjob.crd_file = 'bilbomd_pdb2crd.crd'
    status = {
      status: 'Success',
      message: 'PDB2CRD has completed.'
    }
    await updateStepStatus(DBjob, 'pdb2crd', status)
    logger.debug(`runPdb2Crd completed successfully for job ${DBjob.uuid}`)
  } catch (error) {
    logger.error(`runPdb2Crd failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, MQjob, DBjob, 'pdb2crd')
  }
}

const runPaeToConstInp = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDAutoJob
): Promise<void> => {
  logger.debug(`Starting runPaeToConstInp for job ${DBjob.uuid}`)

  try {
    // Validate required inputs before proceeding
    if (!DBjob.pae_file) {
      throw new Error('PAE file is required but not provided')
    }

    const outputDir = path.join(config.uploadDir, DBjob.uuid)
    logger.debug(`Output directory: ${outputDir}`)

    // Ensure output directory exists
    await fs.ensureDir(outputDir)

    // Validate file existence
    const paeFilePath = path.join(outputDir, DBjob.pae_file)
    const paeExists = await fs.pathExists(paeFilePath)
    if (!paeExists) {
      throw new Error(`PAE file not found: ${paeFilePath}`)
    }
    logger.debug(`PAE file verified: ${paeFilePath}`)

    // Validate file existence and determine what to pass
    let validatedCrdFile: string | undefined
    let validatedPdbFile: string | undefined

    if (DBjob.crd_file) {
      const crdFilePath = path.join(outputDir, DBjob.crd_file)
      const crdExists = await fs.pathExists(crdFilePath)
      if (crdExists) {
        validatedCrdFile = DBjob.crd_file
        logger.debug(`CRD file verified: ${crdFilePath}`)
      } else {
        logger.warn(`CRD file specified but not found: ${crdFilePath}`)
      }
    }

    if (DBjob.pdb_file) {
      const pdbFilePath = path.join(outputDir, DBjob.pdb_file)
      const pdbExists = await fs.pathExists(pdbFilePath)
      if (pdbExists) {
        validatedPdbFile = DBjob.pdb_file
        logger.debug(`PDB file verified: ${pdbFilePath}`)
      } else {
        logger.warn(`PDB file specified but not found: ${pdbFilePath}`)
      }
    }

    // Ensure we have at least one structure file
    if (!validatedCrdFile && !validatedPdbFile) {
      throw new Error(
        'Neither PDB nor CRD file is available for PAE processing'
      )
    }

    // Build params object with validated filenames
    const params: PaeParams = {
      in_crd: validatedCrdFile,
      in_pdb: validatedPdbFile,
      in_pae: DBjob.pae_file,
      out_dir: outputDir
    }

    logger.debug(
      `PAE processing params: in_crd=${params.in_crd}, in_pdb=${params.in_pdb}, in_pae=${params.in_pae}, md_engine=${DBjob.md_engine}`
    )

    // Determine expected output file based on MD engine
    let expectedOutputFile: string

    if (DBjob.md_engine === 'OpenMM') {
      // OpenMM-specific parameters
      params.plddt_cutoff = 50
      params.emit_constraints = true
      params.no_const = true
      expectedOutputFile = 'openmm_const.yml'
      logger.debug('Added OpenMM-specific PAE parameters')
    } else {
      // CHARMM (default case)
      expectedOutputFile = 'const.inp'
      logger.debug('Using CHARMM-specific PAE parameters (default)')
    }

    const expectedOutputPath = path.join(outputDir, expectedOutputFile)
    logger.debug(`Expected output file: ${expectedOutputFile}`)

    let status: IStepStatus = {
      status: 'Running',
      message: `Generate ${expectedOutputFile} from PAE matrix has started.`
    }
    await updateStepStatus(DBjob, 'pae', status)
    logger.debug('Updated step status to Running')

    // Execute PAE to const conversion
    logger.debug('Calling spawnPaeToConst...')
    await spawnPaeToConst(params)
    logger.debug('spawnPaeToConst completed successfully')

    // Verify the expected output file was created
    const outputExists = await fs.pathExists(expectedOutputPath)
    if (!outputExists) {
      throw new Error(
        `${expectedOutputFile} file was not created by PAE processing`
      )
    }
    logger.debug(
      `Verified ${expectedOutputFile} file created: ${expectedOutputPath}`
    )

    // Store constraints in MongoDB
    try {
      await storeConstraintsInMongoDB(
        DBjob,
        expectedOutputPath,
        expectedOutputFile
      )
      logger.debug('Constraints stored in MongoDB successfully')
    } catch (error) {
      logger.warn(`Failed to store constraints in MongoDB: ${error}`)
      // Don't fail the job if constraint storage fails
    }

    // Update job with generated file based on MD engine
    if (DBjob.md_engine === 'OpenMM') {
      // For OpenMM, we might want to store this differently or not at all
      // since const_inp_file is typically for CHARMM
      logger.debug(
        'OpenMM constraints file created - not updating const_inp_file field'
      )
    } else {
      // For CHARMM, update the const_inp_file field
      DBjob.const_inp_file = expectedOutputFile
      await DBjob.save()
      logger.debug('Updated DBjob with const_inp_file')
    }

    status = {
      status: 'Success',
      message: `Generate ${expectedOutputFile} from PAE matrix has completed.`
    }
    await updateStepStatus(DBjob, 'pae', status)
    logger.debug(
      `runPaeToConstInp completed successfully for job ${DBjob.uuid}`
    )
  } catch (error) {
    logger.error(`runPaeToConstInp failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, MQjob, DBjob, 'pae')
  }
}

const runAutoRg = async (DBjob: IBilboMDAutoJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const logFile = path.join(outputDir, 'autoRg.log')
  const errorFile = path.join(outputDir, 'autoRg_error.log')
  const autoRg_script = '/app/scripts/autorg.py'
  const tempOutputFile = path.join(os.tmpdir(), `autoRg_${Date.now()}.json`)
  const args = [autoRg_script, DBjob.data_file, tempOutputFile]

  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)

  let status: IStepStatus = {
    status: 'Running',
    message: 'Calculate Rg has started.'
  }
  await updateStepStatus(DBjob, 'autorg', status)

  return new Promise<void>((resolve, reject) => {
    const autoRg = spawn('/opt/envs/base/bin/python', args, { cwd: outputDir })

    autoRg.stdout?.on('data', (data) => {
      logStream.write(data.toString())
    })

    autoRg.stderr?.on('data', (data) => {
      errorStream.write(data.toString())
    })

    autoRg.on('error', (error) => {
      logger.error(`runAutoRg error: ${error}`)
      errorStream.end() // Ensure error stream is closed on process error
      logStream.end() // Ensure log stream is closed on process error
      reject(error)
    })

    autoRg.on('exit', async (code) => {
      // Close streams explicitly once the process exits
      logStream.end()
      errorStream.end()

      if (code === 0) {
        try {
          // Read the output from the temp file
          const analysisResults = JSON.parse(
            await fs.promises.readFile(tempOutputFile, 'utf-8')
          )

          // Save results to the DBjob
          DBjob.rg = analysisResults.rg
          DBjob.rg_min = analysisResults.rg_min
          DBjob.rg_max = analysisResults.rg_max
          await DBjob.save()

          status = {
            status: 'Success',
            message: 'Calculate Rg completed successfully.'
          }
          await updateStepStatus(DBjob, 'autorg', status)
          resolve()
        } catch (parseError) {
          reject(parseError)
        } finally {
          // Clean up the temporary file
          await fs.promises.unlink(tempOutputFile)
        }
      } else {
        status = {
          status: 'Error',
          message: `AutoRg process exited with code ${code}.`
        }
        await updateStepStatus(DBjob, 'autorg', status)
        reject(new Error(status.message))
      }
    })
  })
}

const runMinimize = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const params: CharmmParams = {
    out_dir: outputDir,
    charmm_template: 'minimize',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'minimize.inp',
    charmm_out_file: 'minimize.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: DBjob.crd_file ?? ''
  }
  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Minimization has started.'
    }
    await updateStepStatus(DBjob, 'minimize', status)
    await generateInputFile(params)
    await spawnCharmm(params, MQjob)
    status = {
      status: 'Success',
      message: 'CHARMM Minimization has completed.'
    }
    await updateStepStatus(DBjob, 'minimize', status)
  } catch (error: unknown) {
    await handleError(error, MQjob, DBjob, 'minimize')
  }
}

const runHeat = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const params: CharmmHeatParams = {
    out_dir: outputDir,
    charmm_template: 'heat',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'heat.inp',
    charmm_out_file: 'heat.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: 'minimization_output.crd',
    constinp: DBjob.const_inp_file ?? ''
  }
  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Heating has started.'
    }
    await updateStepStatus(DBjob, 'heat', status)
    await generateInputFile(params)
    await spawnCharmm(params, MQjob)
    status = {
      status: 'Success',
      message: 'CHARMM Heating has completed.'
    }
    await updateStepStatus(DBjob, 'heat', status)
  } catch (error) {
    await handleError(error, MQjob, DBjob, 'heat')
  }
}

const runMolecularDynamics = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const params: CharmmMDParams = {
    out_dir: outputDir,
    charmm_template: 'dynamics',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: '',
    charmm_out_file: '',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: '',
    constinp: DBjob.const_inp_file ?? '',
    rg_min: DBjob.rg_min ?? 20,
    rg_max: DBjob.rg_max ?? 60,
    conf_sample: DBjob.conformational_sampling,
    timestep: 0.001,
    inp_basename: '',
    rg: 0
  }

  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Molecular Dynamics has started.'
    }
    await updateStepStatus(DBjob, 'md', status)
    const molecularDynamicsTasks = []
    const step = Math.max(Math.round((params.rg_max - params.rg_min) / 5), 1)
    for (let rg = params.rg_min; rg <= params.rg_max; rg += step) {
      params.charmm_inp_file = `${params.charmm_template}_rg${rg}.inp`
      params.charmm_out_file = `${params.charmm_template}_rg${rg}.out`
      params.inp_basename = `${params.charmm_template}_rg${rg}`
      params.rg = rg
      await generateInputFile(params)
      molecularDynamicsTasks.push(spawnCharmm(params, MQjob))
    }
    await Promise.all(molecularDynamicsTasks)
    status = {
      status: 'Success',
      message: 'CHARMM Molecular Dynamics has completed.'
    }
    await updateStepStatus(DBjob, 'md', status)
  } catch (error) {
    await handleError(error, MQjob, DBjob, 'md')
  }
}

const runMultiFoxs = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const multifoxsParams: MultiFoxsParams = {
    out_dir: outputDir,
    data_file: DBjob.data_file
  }
  try {
    let status: IStepStatus = {
      status: 'Running',
      message: 'MultiFoXS Calculations have started.'
    }
    await updateStepStatus(DBjob, 'multifoxs', status)
    const multiFoxsDir = path.join(multifoxsParams.out_dir, 'multifoxs')
    await makeDir(multiFoxsDir)
    await makeFoxsDatFileList(multiFoxsDir)
    await spawnMultiFoxs(multifoxsParams)
    status = {
      status: 'Success',
      message: 'MultiFoXS Calculations have completed.'
    }
    await updateStepStatus(DBjob, 'multifoxs', status)
  } catch (error) {
    await handleError(error, MQjob, DBjob, 'multifoxs')
  }
}

const copyFiles = async ({
  source,
  destination,
  filename,
  MQjob,
  isCritical
}: FileCopyParams): Promise<void> => {
  try {
    await execPromise(`cp ${source} ${destination}`)
    MQjob.log(`Gathered ${filename}`)
  } catch (error) {
    logger.error(`Error copying ${filename}: ${error}`)
    if (isCritical) {
      throw new Error(`Critical error copying ${filename}: ${error}`)
    }
  }
}

const prepareResults = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
): Promise<void> => {
  try {
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const multiFoxsDir = path.join(jobDir, 'multifoxs')
    const logFile = path.join(multiFoxsDir, 'multi_foxs.log')
    const resultsDir = path.join(jobDir, 'results')

    // Create new empty results directory
    try {
      await makeDir(resultsDir)
      MQjob.log('Create results directory')
    } catch (error) {
      logger.error(`Error creating results directory: ${error}`)
      // Decide whether to continue or throw based on your application's requirements
    }

    {
      const baseDataName = DBjob.data_file.split('.')[0]
      const charmmPdb = path.join(jobDir, 'minimization_output.pdb')
      const openmmPdb = path.join(jobDir, 'minimize', 'minimized.pdb')

      const pdbSource = (await fs.pathExists(openmmPdb))
        ? openmmPdb
        : (await fs.pathExists(charmmPdb))
          ? charmmPdb
          : null

      if (pdbSource) {
        await copyFiles({
          source: pdbSource,
          destination: resultsDir,
          filename: path.basename(pdbSource), // keep original filename
          MQjob,
          isCritical: false
        })
      } else {
        logger.warn(
          'No minimized PDB found (checked OpenMM and CHARMM locations).'
        )
      }

      // --- Copy the DAT file for the minimized PDB (supports both layouts)
      const charmmDat = path.join(
        jobDir,
        `minimization_output_${baseDataName}.dat`
      )
      const openmmDat = path.join(
        jobDir,
        'minimize',
        `minimized_${baseDataName}.dat`
      )

      const datSource = (await fs.pathExists(openmmDat))
        ? openmmDat
        : (await fs.pathExists(charmmDat))
          ? charmmDat
          : null

      if (datSource) {
        await copyFiles({
          source: datSource,
          destination: resultsDir,
          filename: path.basename(datSource),
          MQjob,
          isCritical: false
        })
      } else {
        logger.warn(
          'No minimized DAT file found (checked OpenMM and CHARMM locations).'
        )
      }
    }

    // Copy ensemble_size_*.txt files
    await copyFiles({
      source: `${multiFoxsDir}/ensembles_size*.txt`,
      destination: resultsDir,
      filename: 'ensembles_size*.txt',
      MQjob,
      isCritical: false
    })

    // Copy multi_state_model_*_1_1.dat files
    await copyFiles({
      source: `${multiFoxsDir}/multi_state_model_*_1_1.dat`,
      destination: resultsDir,
      filename: 'multi_state_model_*_1_1.dat',
      MQjob,
      isCritical: false
    })

    // Gather original uploaded files
    const filesToCopy = [{ file: DBjob.data_file, label: 'data_file' }]

    if ('pdb_file' in DBjob && DBjob.pdb_file) {
      filesToCopy.push({ file: DBjob.pdb_file, label: 'pdb_file' })
    }

    if ('crd_file' in DBjob && DBjob.crd_file) {
      filesToCopy.push({ file: DBjob.crd_file, label: 'crd_file' })
    }

    if ('psf_file' in DBjob && DBjob.psf_file) {
      filesToCopy.push({ file: DBjob.psf_file, label: 'psf_file' })
    }

    if ('pae_file' in DBjob && DBjob.pae_file) {
      filesToCopy.push({ file: DBjob.pae_file, label: 'pae_file' })
    }

    if ('const_inp_file' in DBjob && DBjob.const_inp_file) {
      filesToCopy.push({ file: DBjob.const_inp_file, label: 'const_inp_file' })
    }

    // FASTA file generated from the alphafold_entities
    if ('fasta_file' in DBjob && DBjob.fasta_file) {
      filesToCopy.push({ file: DBjob.fasta_file, label: 'fasta_file' })
    }

    // Additional AlphaFold-specific files
    // These files are not present in MongoDB because we currently do not update
    // MongoDB during a NERSC job.
    if (DBjob.__t === 'BilboMdAlphaFold') {
      const alphafoldExtraFiles = [
        'af-pae.json',
        'af-rank1.pdb',
        'bilbomd_pdb2crd.psf',
        'bilbomd_pdb2crd.crd'
      ]
      alphafoldExtraFiles.forEach((file) => {
        filesToCopy.push({ file, label: file })
      })
    }

    for (const { file, label } of filesToCopy) {
      if (file) {
        await copyFiles({
          source: path.join(jobDir, file),
          destination: resultsDir,
          filename: label,
          MQjob,
          isCritical: false
        })
      } else {
        logger.warn(`Expected file for '${label}' is undefined.`)
      }
    }

    // Only want to add N best PDBs equal to number_of_states N in logfile.
    const numEnsembles = await getNumEnsembles(logFile)
    logger.info(`prepareResults numEnsembles: ${numEnsembles}`)
    MQjob.log(`Gather ${numEnsembles} best ensembles`)

    if (numEnsembles) {
      // Iterate through each ensembles_siz_*.txt file
      for (let i = 1; i <= numEnsembles; i++) {
        const ensembleFile = path.join(multiFoxsDir, `ensembles_size_${i}.txt`)
        logger.info(`prepareResults ensembleFile: ${ensembleFile}`)
        const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
        const pdbFilesRelative = extractPdbPaths(ensembleFileContent)

        const pdbFilesFullPath = pdbFilesRelative.map((item) =>
          path.join(jobDir, item)
        )
        // Extract the first N PDB files to string[]
        const numToCopy = Math.min(pdbFilesFullPath.length, i)
        const ensembleModelFiles = pdbFilesFullPath.slice(0, numToCopy)
        const ensembleSize = ensembleModelFiles.length
        await concatenateAndSaveAsEnsemble(
          ensembleModelFiles,
          ensembleSize,
          resultsDir
        )

        MQjob.log(
          `Gathered ${pdbFilesFullPath.length} PDB files from ensembles_size_${i}.txt`
        )
      }
    }

    // Write the DBjob to a JSON file
    try {
      const dbJobJsonPath = path.join(resultsDir, 'bilbomd_job.json')
      await fs.writeFile(dbJobJsonPath, JSON.stringify(DBjob, null, 2), 'utf8')
      MQjob.log(`DBjob data written to ${dbJobJsonPath}`)
    } catch (error) {
      logger.error(`Error writing DBjob JSON file: ${error}`)
    }

    // scripts/pipeline_decision_tree.py
    try {
      await spawnFeedbackScript(DBjob)
      MQjob.log(`Feedback script executed successfully`)
    } catch (error) {
      logger.error(`Error running feedback script: ${error}`)
    }

    // create the rgyr vs. dmax multifoxs ensembles plots
    try {
      await spawnRgyrDmaxScript(DBjob)
      MQjob.log(`Rgyr vs. Dmax script executed successfully`)
    } catch (error) {
      logger.error(`Error running Rgyr vs. Dmax script: ${error}`)
    }

    // Create Job-specific README file.
    try {
      await createReadmeFile(DBjob, numEnsembles, resultsDir)
      MQjob.log(`wrote README.md file`)
    } catch (error) {
      logger.error(`Error creating README file: ${error}`)
    }

    // Create the results tar.gz file
    try {
      const uuidPrefix = DBjob.uuid.split('-')[0]
      const archiveName = `results-${uuidPrefix}.tar.gz`
      await execPromise(`tar czvf ${archiveName} results`, { cwd: jobDir })
      MQjob.log(`created ${archiveName} file`)
    } catch (error) {
      logger.error(`Error creating tar file: ${error}`)
      throw error // Critical error, rethrow or handle specifically if necessary
    }
  } catch (error) {
    await handleError(error, MQjob, DBjob, 'results')
  }
}

const spawnRgyrDmaxScript = async (DBjob: IJob): Promise<void> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const logFile = path.join(jobDir, 'rgyr_v_dmax.log')
  const errorFile = path.join(jobDir, 'rgyr_v_dmax_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const scriptPath = '/app/scripts/rgyr_v_dmax_analysis.py'
  const args = [scriptPath, jobDir]
  const opts = { cwd: jobDir }

  return new Promise((resolve, reject) => {
    const runRgyrDmaxScript: ChildProcess = spawn(
      '/opt/envs/base/bin/python',
      args,
      opts
    )

    runRgyrDmaxScript.stdout?.on('data', (data) => {
      logger.info(`Rgyr Dmax script stdout: ${data.toString()}`)
      logStream.write(data.toString())
    })

    runRgyrDmaxScript.stderr?.on('data', (data) => {
      logger.error(`Rgyr Dmax script stderr: ${data.toString()}`)
      errorStream.write(data.toString())
    })

    runRgyrDmaxScript.on('error', (error) => {
      logger.error(`Rgyr Dmax script error: ${error}`)
      reject(error)
    })

    runRgyrDmaxScript.on('exit', async (code: number) => {
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]

      await Promise.all(closeStreamsPromises)
      if (code === 0) {
        logger.info(
          `Rgyr Dmax script completed successfully with exit code ${code}`
        )
        resolve()
      } else {
        logger.error(`Rgyr Dmax script failed with exit code ${code}`)
        reject(
          new Error('Rgyr Dmax script failed. Please see the error log file.')
        )
      }
    })
  })
}

const spawnFeedbackScript = async (DBjob: IJob): Promise<void> => {
  const resultsDir = path.join(config.uploadDir, DBjob.uuid, 'results')
  const logFile = path.join(resultsDir, 'feedback.log')
  const errorFile = path.join(resultsDir, 'feedback_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const scriptPath = '/app/scripts/pipeline_decision_tree.py'
  const args = [scriptPath, resultsDir]
  const opts = { cwd: resultsDir }

  return new Promise((resolve, reject) => {
    const runFeedbackScript: ChildProcess = spawn(
      '/opt/envs/base/bin/python',
      args,
      opts
    )

    runFeedbackScript.stdout?.on('data', (data) => {
      logger.info(`Feedback script stdout: ${data.toString()}`)
      logStream.write(data.toString())
    })

    runFeedbackScript.stderr?.on('data', (data) => {
      logger.error(`Feedback script stderr: ${data.toString()}`)
      errorStream.write(data.toString())
    })

    runFeedbackScript.on('error', (error) => {
      logger.error(`Feedback script error: ${error}`)
      reject(error)
    })

    runFeedbackScript.on('exit', async (code: number) => {
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]

      await Promise.all(closeStreamsPromises)

      if (code === 0) {
        logger.info(
          `Feedback script completed successfully with exit code ${code}`
        )

        // Read and save feedback.json to DBjob
        const feedbackFilePath = path.join(resultsDir, 'feedback.json')
        try {
          const feedbackData = await fs.promises.readFile(
            feedbackFilePath,
            'utf-8'
          )
          const feedbackJSON = JSON.parse(feedbackData)

          logger.info(
            `Parsed feedback data for job ${DBjob.uuid}: ${JSON.stringify(feedbackJSON)}`
          )

          // Update DBjob with feedback and save it
          DBjob.feedback = feedbackJSON
          await DBjob.save()

          logger.info(`Feedback data saved to MongoDB for job ${DBjob.uuid}`)
          resolve()
        } catch (err) {
          logger.error(
            `Failed to read or parse feedback.json for job ${DBjob.uuid}: ${err}`
          )
          reject(err)
        }
      } else {
        logger.error(`Feedback script failed with exit code ${code}`)
        reject(
          new Error('Feedback script failed. Please see the error log file.')
        )
      }
    })
  })
}

const createReadmeFile = async (
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob,
  numEnsembles: number,
  resultsDir: string
): Promise<void> => {
  let originalFiles = ``
  switch (DBjob.__t) {
    case 'BilboMdCRD': {
      const crdJob = DBjob as IBilboMDCRDJob
      originalFiles = `
- Original CRD file: ${crdJob.crd_file}
- Original PSF file: ${crdJob.psf_file}
- Original experimental SAXS data file: ${crdJob.data_file}
- Original const.inp file: ${crdJob.const_inp_file}
- Generated minimized PDB file: minimized_output.pdb
- Generated minimized PDB DAT file: minimization_output_${
        crdJob.data_file.split('.')[0]
      }.dat
`
      break
    }
    case 'BilboMdPDB': {
      const pdbJob = DBjob as IBilboMDPDBJob
      originalFiles = `
- Original PDB file: ${pdbJob.pdb_file}
- Generated CRD file: ${pdbJob.crd_file}
- Generated PSF file: ${pdbJob.psf_file}
- Original experimental SAXS data file: ${pdbJob.data_file}
- Original const.inp file: ${pdbJob.const_inp_file}
- Generated minimized PDB file: minimized_output.pdb
- Generated minimized PDB DAT file: minimization_output_${
        pdbJob.data_file.split('.')[0]
      }.dat
`
      break
    }
    case 'BilboMdAuto': {
      const autoJob = DBjob as IBilboMDAutoJob
      originalFiles = `
- Original PDB file: ${autoJob.pdb_file}
- Original PAE file: ${autoJob.pae_file}
- Generated CRD file: ${autoJob.crd_file}
- Generated PSF file: ${autoJob.psf_file}
- Original experimental SAXS data file: ${autoJob.data_file}
- Generated const.inp file: ${autoJob.const_inp_file}
- Generated minimized PDB file: minimized_output.pdb
- Generated minimized PDB DAT file: minimization_output_${
        autoJob.data_file.split('.')[0]
      }.dat
`
      break
    }
    case 'BilboMdAlphaFold': {
      const alphafoldJob = DBjob as IBilboMDAlphaFoldJob
      originalFiles = `
- Original experimental SAXS data file: ${alphafoldJob.data_file}
- FASTA file: ${alphafoldJob.fasta_file}
- AlphaFold PDB file: af-rank1.pdb
- AlphaFold PAE file: af-pae.json
- Generated CRD file: bilbomd_pdb2crd.crd
- Generated PSF file: bilbomd_pdb2crd.psf
- Generated const.inp file: const.inp
- Generated minimized PDB file: minimized_output.pdb
- Generated minimized PDB DAT file: minimization_output_${
        alphafoldJob.data_file.split('.')[0]
      }.dat
`
      break
    }
  }
  const readmeContent = `
# BilboMD Job Results

This directory contains the results for your ${DBjob.title} BilboMD job.

- Job Title:  ${DBjob.title}
- Job ID:  ${DBjob._id}
- UUID:  ${DBjob.uuid}
- Submitted:  ${DBjob.time_submitted}
- Completed:  ${new Date().toString()}

## Contents
${originalFiles}
The Ensemble files will be present in multiple copies. There is one file for each ensemble size.

- Number of ensembles for this BilboMD run: ${numEnsembles}

- Ensemble PDB file(s):  ensemble_size_N_model.pdb
- Ensemble TXT file(s):  ensemble_size_N.txt
- Ensemble DAT file(s):  multi_state_model_N_1_1.dat

## The ensemble_size_N.txt files

Here is an example from a hypothetical ensemble_size_3.txt file:

1 |  2.89 | x1 2.89 (0.99, -0.50)
   70   | 0.418 (0.414, 0.011) | ../foxs/rg25_run3/dcd2pdb_rg25_run3_271500.pdb.dat (0.138)
   87   | 0.508 (0.422, 0.101) | ../foxs/rg41_run1/dcd2pdb_rg41_run1_35500.pdb.dat (0.273)
  184   | 0.074 (0.125, 0.024) | ../foxs/rg45_run1/dcd2pdb_rg45_run1_23000.pdb.dat (0.025)

In this example we show only the "best" 3-state ensemble. Each ensemble_size_N.txt file will
actually contain many possible N-state ensembles.

The first line is a summary of scores and fit parameters for a particular multi-state model:
    - The first column is a number/rank of the multi-state model (sorted by score)
    - The second column is a Chi^2 value for the fit to SAXS profile (2.89)
    - The third column repeats the Chi^2 value and also displays a pair of c1 (0.99) and c2 (-0.50)
      values (in brackets) from the MultiFoXS optimized fit to data.

After the model summary line the file contains information about the states (one line per state).
In this example the best scoring 3-state model consists of conformation numbers 70, 87, and 184
with weights of 0.418, 0.508, and 0.074 respectively. The numbers in brackets after the
conformation weight are an average and a standard	deviation of the weight calculated for this
conformation across all good scoring multi-state models of this size. The number in brackets
after the filename is the fraction of good scoring multi-state models that contain this conformation.

## The ensemble_size_N_model.pdb files

In the case of N>2 These will be multi-model PDB files. For N=1 it will just be the best single conformer
to fit your SAXS data.

ensemble_size_1_model.pdb  - will contain the coordinates for the best 1-state model
ensemble_size_2_model.pdb  - will contain the coordinates for the best 2-state model
ensemble_size_3_model.pdb  - will contain the coordinates for the best 3-state model
etc.

## The multi_state_model_N_1_1.dat files

These are the theoretical SAXS curves from MultiFoXS calculated for each of the ensemble_size_N_model.pdb models.

If you use BilboMD in your research, please cite:

Pelikan M, Hura GL, Hammel M. Structure and flexibility within proteins as identified through small angle X-ray scattering. Gen Physiol Biophys. 2009 Jun;28(2):174-89. doi: 10.4149/gpb_2009_02_174. PMID: ,19592714; PMCID: PMC3773563.

Thank you for using BilboMD
`
  const readmePath = path.join(resultsDir, 'README.md')
  try {
    await fs.writeFile(readmePath, readmeContent)
    logger.info('README file created successfully.')
  } catch (error) {
    logger.error(`Failed to create README file: ${error}`)
    throw new Error('Failed to create README file')
  }
}

export {
  runPdb2Crd,
  runPaeToConstInp,
  runAutoRg,
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs,
  prepareResults,
  handleError,
  generateDCD2PDBInpFile,
  spawnCharmm,
  getNumEnsembles,
  extractPdbPaths,
  concatenateAndSaveAsEnsemble,
  spawnFeedbackScript,
  spawnRgyrDmaxScript,
  createReadmeFile,
  storeConstraintsInMongoDB
}
