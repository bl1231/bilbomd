import path from 'path'
import fs from 'fs-extra'
import YAML from 'yaml'
import { Job as BullMQJob } from 'bullmq'
import {
  convertInpToYaml,
  validateYamlConstraints,
  buildChainMolTypes,
  buildChainMolTypesFromInp
} from '@bilbomd/md-utils'
import {
  IStepStatus,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IMDConstraints,
  IChainMolType,
  Job
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'

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
  fileName: string,
  pdbFilePath?: string
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

    // Prefer the PDB; a CRD-only job can still read types from const.inp segids
    let chainMolTypes: IChainMolType[] | undefined
    if (pdbFilePath) {
      chainMolTypes = await buildChainMolTypes(pdbFilePath)
    } else if (fileName === 'const.inp') {
      chainMolTypes = await buildChainMolTypesFromInp(filePath)
    }

    DBjob.set('md_constraints', {
      fixed_bodies: constraintsObj.fixed_bodies ?? [],
      rigid_bodies: constraintsObj.rigid_bodies ?? [],
      chain_mol_types: chainMolTypes
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
        expectedOutputFile,
        validatedPdbFile && path.join(outputDir, validatedPdbFile)
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

export { runPaeToConstInp, spawnPaeToConst }
