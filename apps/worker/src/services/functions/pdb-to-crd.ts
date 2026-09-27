import { Job as BullMQJob } from 'bullmq'
import {
  IStepStatus,
  IBilboMDPDBJob,
  IBilboMDSANSJob,
  IBilboMDAutoJob
} from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { runCharmm } from './charmm.js'
import { updateStepStatus } from './mongo-utils.js'
import { handleError } from './job-utils.js'
import path from 'path'

const uploadFolder = process.env.DATA_VOL ?? '/bilbomd/uploads'
const CHARMM_BIN = process.env.CHARMM ?? '/usr/local/bin/charmm'
const PYTHON_BIN = '/opt/envs/base/bin/python'

interface Pdb2CrdCharmmInputData {
  uuid: string
  pdb_file: string
}

const createPdb2CrdCharmmInpFiles = async (
  data: Pdb2CrdCharmmInputData
): Promise<string[]> => {
  logger.info(`in createCharmmInpFile: ${JSON.stringify(data)}`)
  const workingDir = path.join(uploadFolder, data.uuid)
  const inputPDB = path.join(workingDir, data.pdb_file)

  // pdb2crd.py prints the name of each CHARMM input file it writes, one per line
  const outputFiles: string[] = []
  await runProcess({
    label: 'pdb2crd.py',
    cmd: PYTHON_BIN,
    args: ['/app/scripts/pdb2crd.py', inputPDB, '.'],
    cwd: workingDir,
    stdoutFile: path.join(workingDir, 'pdb2crd-python.log'),
    stderrFile: path.join(workingDir, 'pdb2crd-python_error.log'),
    timeoutMs: config.processTimeouts.helperScriptMs,
    onStdoutLine: (line) => {
      const inpFile = line.trim()
      if (inpFile) {
        logger.info(`inpFile: ${inpFile}`)
        outputFiles.push(inpFile)
      }
    },
    onStderrLine: (line) => logger.error(`createCharmmInpFile stderr: ${line}`)
  })

  logger.info(`Successfully parsed output files: ${outputFiles.join(', ')}`)
  return outputFiles
}

const runPdb2CrdCharmmFile = async (
  MQJob: BullMQJob,
  workingDir: string,
  inputFile: string
): Promise<string> => {
  const output = await runCharmm({
    charmmBin: CHARMM_BIN,
    inputFile,
    outputFile: `${inputFile.split('.')[0]}.log`,
    cwd: workingDir,
    timeoutMs: config.processTimeouts.charmmSetupMs
  })
  MQJob.log(`pdb2crd done with ${inputFile}`)
  return output
}

const spawnPdb2CrdCharmm = (
  MQJob: BullMQJob,
  inputFiles: string[]
): Promise<string[]> => {
  const workingDir = path.join(uploadFolder, MQJob.data.uuid)
  logger.info(`inputFiles for job ${MQJob.data.uuid}: ${inputFiles.join('\n')}`)

  // One CHARMM run per input file, all in parallel
  return Promise.all(
    inputFiles.map((inputFile) =>
      runPdb2CrdCharmmFile(MQJob, workingDir, inputFile)
    )
  )
}

// Runs one of the small PDB preparation scripts: `python <script> ...args`,
// logging to <logName>.log / <logName>_error.log in the job directory.
const runPrepScript = (
  workingDir: string,
  script: string,
  args: string[],
  logName: string,
  logPrefix: string
) =>
  runProcess({
    label: path.basename(script),
    cmd: PYTHON_BIN,
    args: [script, ...args],
    cwd: workingDir,
    stdoutFile: path.join(workingDir, `${logName}.log`),
    stderrFile: path.join(workingDir, `${logName}_error.log`),
    timeoutMs: config.processTimeouts.helperScriptMs,
    onStderrLine: (line) => logger.error(`${logPrefix} stderr: ${line}`)
  })

interface PrepPdbData {
  uuid: string
  pdb_file: string
}

const runPrepPdb = async (data: PrepPdbData): Promise<void> => {
  const workingDir = path.join(uploadFolder, data.uuid)
  logger.info(`runPrepPdb: preparing ${data.pdb_file} for OpenMM`)

  await runPrepScript(
    workingDir,
    '/app/scripts/prep_pdb.py',
    [path.join(workingDir, data.pdb_file)],
    'prep_pdb',
    'runPrepPdb'
  )
  logger.info(`runPrepPdb succeeded for ${data.pdb_file}`)
}

interface CifToPdbData {
  uuid: string
  pdb_file: string
}

/**
 * Convert an mmCIF file to PDB format using biopython.
 * Returns the basename of the output PDB file (the .cif extension replaced with .pdb).
 */
const runCifToPdb = async (data: CifToPdbData): Promise<string> => {
  const workingDir = path.join(uploadFolder, data.uuid)
  const outputPdbName = data.pdb_file.replace(/\.cif$/i, '.pdb')
  logger.info(`runCifToPdb: converting ${data.pdb_file} -> ${outputPdbName}`)

  await runPrepScript(
    workingDir,
    '/app/scripts/cif_to_pdb.py',
    [
      path.join(workingDir, data.pdb_file),
      path.join(workingDir, outputPdbName)
    ],
    'cif_to_pdb',
    'runCifToPdb'
  )
  logger.info(`runCifToPdb succeeded: ${outputPdbName}`)
  return outputPdbName
}

interface StripCofactorsData {
  uuid: string
  pdb_file: string
}

/**
 * Strip molecular cofactors (FAD, HEM, PCA, etc.) that have no parameters in the
 * bundled Amber/GLYCAM force fields. Writes stripped_cofactors.json to the job dir.
 */
const runStripCofactors = async (data: StripCofactorsData): Promise<void> => {
  const workingDir = path.join(uploadFolder, data.uuid)
  logger.info(`runStripCofactors: stripping cofactors from ${data.pdb_file}`)

  await runPrepScript(
    workingDir,
    '/app/scripts/strip_cofactors.py',
    [path.join(workingDir, data.pdb_file)],
    'strip_cofactors',
    'runStripCofactors'
  )
  logger.info(`runStripCofactors succeeded for ${data.pdb_file}`)
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

export {
  runPdb2Crd,
  createPdb2CrdCharmmInpFiles,
  spawnPdb2CrdCharmm,
  runPrepPdb,
  runStripCofactors,
  runCifToPdb
}
