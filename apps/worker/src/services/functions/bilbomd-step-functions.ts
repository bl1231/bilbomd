import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { getErrorMessage } from '../../helpers/errors.js'
import { promisify } from 'util'
import fs from 'fs-extra'
import os from 'os'

import path from 'path'
import YAML from 'yaml'
import { convertInpToYaml, validateYamlConstraints } from '@bilbomd/md-utils'
import { Job as BullMQJob } from 'bullmq'
import {
  IStepStatus,
  IJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob,
  IMDConstraints,
  Job
} from '@bilbomd/mongodb-schema'
import { exec } from 'node:child_process'
import {
  createPdb2CrdCharmmInpFiles,
  spawnPdb2CrdCharmm
} from './pdb-to-crd.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  makeDir,
  generateDCD2PDBInpFile,
  generateInputFile,
  spawnCharmm,
  handleError
} from './job-utils.js'

const execPromise = promisify(exec)

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

const spawnMultiFoxs = async (params: MultiFoxsParams): Promise<void> => {
  const multiFoxsDir = path.join(params.out_dir, 'multifoxs')
  await runProcess({
    label: 'MultiFoXS',
    cmd: config.multifoxsBin,
    args: [
      '-o',
      path.join(params.out_dir, params.data_file),
      'foxs_dat_files.txt'
    ],
    cwd: multiFoxsDir,
    stdoutFile: path.join(multiFoxsDir, 'multi_foxs.log'),
    stderrFile: path.join(multiFoxsDir, 'multi_foxs_error.log'),
    timeoutMs: config.processTimeouts.multifoxsMs
  })
  logger.info('spawnMultiFoxs completed successfully')
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

  const pythonBin = params.python_bin ?? config.basePythonBin
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

  logger.debug(`Working directory: ${params.out_dir}`)

  await runProcess({
    label: 'pae2const.py',
    cmd: pythonBin,
    args,
    cwd: params.out_dir,
    stdoutFile: logFile,
    stderrFile: errorFile,
    appendLogs: true,
    timeoutMs: config.processTimeouts.helperScriptMs,
    onStderrLine: (line) => logger.error(`runPaeToConst stderr: ${line}`)
  })
  logger.debug('runPaeToConst completed successfully')
  return '0'
}

const storeConstraintsInMongoDB = async (
  DBjob: IBilboMDAutoJob | IBilboMDAlphaFoldJob | IBilboMDOpenFoldJob,
  filePath: string,
  fileName: string
): Promise<void> => {
  try {
    logger.debug(`Storing constraints in MongoDB from file: ${filePath}`)

    type ParsedConstraints = IMDConstraints | { constraints: IMDConstraints }
    let parsed: ParsedConstraints

    if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
      // Parse YAML constraints for OpenMM
      logger.debug('Processing YAML constraints file for OpenMM')

      // Validate the YAML file first
      await validateYamlConstraints(filePath, logger)

      // Parse and store the YAML constraints
      const fileContent = await fs.readFile(filePath, 'utf8')
      parsed = YAML.parse(fileContent) as ParsedConstraints
      logger.debug(
        `Parsed YAML constraints: ${JSON.stringify(parsed, null, 2)}`
      )
    } else if (fileName === 'const.inp') {
      // For CHARMM const.inp, convert it to YAML format first, then parse
      logger.debug('Converting CHARMM const.inp to YAML format')

      // Convert INP to YAML using the shared utility
      const yamlContent = await convertInpToYaml(filePath, logger)

      // Parse the converted YAML into constraints object
      parsed = YAML.parse(yamlContent) as ParsedConstraints
      logger.debug(
        `Converted and parsed CHARMM constraints: ${JSON.stringify(parsed, null, 2)}`
      )
    } else {
      throw new Error(`Unsupported constraint file format: ${fileName}`)
    }

    // Unwrap if needed
    const constraintsObj = 'constraints' in parsed ? parsed.constraints : parsed

    DBjob.set('md_constraints', {
      fixed_bodies: constraintsObj.fixed_bodies ?? [],
      rigid_bodies: constraintsObj.rigid_bodies ?? []
    })

    await DBjob.save()
    const fresh = await Job.findById(DBjob._id)
    if (fresh) {
      logger.debug(
        `Reloaded md_constraints: ${JSON.stringify(fresh.md_constraints)}`
      )
    } else {
      logger.warn(
        'Could not reload job from database after saving constraints.'
      )
    }
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
  DBjob: IBilboMDPDBJob | IBilboMDSANSJob | IBilboMDAutoJob
): Promise<void> => {
  try {
    logger.info(`Starting pdb2crd for job ${DBjob.uuid}`)
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
    logger.info(`Completed pdb2crd for job ${DBjob.uuid}`)
  } catch (error) {
    logger.error(`runPdb2Crd failed for job ${DBjob.uuid}: ${error}`)
    await handleError(error, DBjob, 'pdb2crd')
  }
}

const runPaeToConstInp = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDAutoJob | IBilboMDAlphaFoldJob | IBilboMDOpenFoldJob
): Promise<void> => {
  try {
    logger.info(`Starting pae2const for job ${DBjob.uuid}`)

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
    await handleError(error, DBjob, 'pae')
  }
}

const runAutoRg = async (DBjob: IBilboMDAutoJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const tempOutputFile = path.join(os.tmpdir(), `autoRg_${Date.now()}.json`)

  logger.info(`Starting autorg for job ${DBjob.uuid}`)
  await updateStepStatus(DBjob, 'autorg', {
    status: 'Running',
    message: 'Calculate Rg has started.'
  })

  try {
    await runProcess({
      label: 'AutoRg',
      cmd: '/opt/envs/base/bin/python',
      args: ['/app/scripts/autorg.py', DBjob.data_file, tempOutputFile],
      cwd: outputDir,
      stdoutFile: path.join(outputDir, 'autoRg.log'),
      stderrFile: path.join(outputDir, 'autoRg_error.log'),
      timeoutMs: config.processTimeouts.helperScriptMs
    })
  } catch (error) {
    await updateStepStatus(DBjob, 'autorg', {
      status: 'Error',
      message: getErrorMessage(error)
    })
    await fs.remove(tempOutputFile)
    throw error
  }

  try {
    const analysisResults = JSON.parse(
      await fs.promises.readFile(tempOutputFile, 'utf-8')
    )
    DBjob.rg = analysisResults.rg
    DBjob.rg_min = analysisResults.rg_min
    DBjob.rg_max = analysisResults.rg_max
    await DBjob.save()
  } finally {
    await fs.remove(tempOutputFile)
  }

  await updateStepStatus(DBjob, 'autorg', {
    status: 'Success',
    message: 'Calculate Rg completed successfully.'
  })
  logger.info(`Completed autorg for job ${DBjob.uuid}`)
}

const runMinimize = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmMinimizeDir = path.join(outputDir, 'charmm', 'minimize')

  // Create the charmm/minimize directory
  await makeDir(charmmMinimizeDir)

  const params: CharmmParams = {
    out_dir: charmmMinimizeDir,
    charmm_template: 'minimize',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'minimize.inp',
    charmm_out_file: 'minimize.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: DBjob.crd_file ?? ''
  }
  try {
    logger.info(`Starting CHARMM minimize for job ${DBjob.uuid}`)
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
    logger.info(`Completed CHARMM minimize for job ${DBjob.uuid}`)
  } catch (error: unknown) {
    await handleError(error, DBjob, 'minimize')
  }
}

const runHeat = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmHeatDir = path.join(outputDir, 'charmm', 'heat')

  // Create the charmm/heat directory
  await makeDir(charmmHeatDir)

  const params: CharmmHeatParams = {
    out_dir: charmmHeatDir,
    charmm_template: 'heat',
    charmm_topo_dir: config.charmmTopoDir,
    charmm_inp_file: 'heat.inp',
    charmm_out_file: 'heat.out',
    in_psf_file: DBjob.psf_file ?? '',
    in_crd_file: 'minimization_output.crd',
    constinp: DBjob.const_inp_file ?? ''
  }
  try {
    logger.info(`Starting CHARMM heat for job ${DBjob.uuid}`)
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
    logger.info(`Completed CHARMM heat for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'heat')
  }
}

const runMolecularDynamics = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDCRDJob
    | IBilboMDPDBJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
    | IBilboMDOpenFoldJob
    | IBilboMDSANSJob
): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const charmmMdDir = path.join(outputDir, 'charmm', 'md')

  // Create the charmm/md directory
  await makeDir(charmmMdDir)

  const params: CharmmMDParams = {
    out_dir: charmmMdDir,
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
    logger.info(`Starting CHARMM MD for job ${DBjob.uuid}`)
    let status: IStepStatus = {
      status: 'Running',
      message: 'CHARMM Molecular Dynamics has started.'
    }
    await updateStepStatus(DBjob, 'md', status)
    const molecularDynamicsTasks = []
    let rgyrList: number[] = []
    if (
      'charmm_parameters' in DBjob &&
      Array.isArray(DBjob.charmm_parameters?.md?.rgyr)
    ) {
      rgyrList = DBjob.charmm_parameters.md.rgyr
    }
    for (const rg of rgyrList) {
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
    logger.info(`Completed CHARMM MD for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'md')
  }
}

const runMultiFoxs = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const multifoxsParams: MultiFoxsParams = {
    out_dir: outputDir,
    data_file: DBjob.data_file
  }
  try {
    logger.info(`Starting MultiFoXS for job ${DBjob.uuid}`)
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
    logger.info(`Completed MultiFoXS for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'multifoxs')
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
  generateDCD2PDBInpFile,
  spawnCharmm,
  spawnMultiFoxs,
  spawnPaeToConst
}
