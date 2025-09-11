import {
  User,
  IJob,
  IBilboMDSteps,
  IStepStatus,
  IBilboMDCRDJob,
  IBilboMDPDBJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  StepStatusEnum
} from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import fs from 'fs-extra'
import { executeNerscScript, monitorTaskAtNERSC } from './nersc-api-functions.js'
import {
  isBilboMDPDBJob,
  isBilboMDCRDJob,
  isBilboMDAutoJob,
  isBilboMDAlphaFoldJob
} from './bilbomd-step-functions-nersc.js'
import {
  getNumEnsembles,
  extractPdbPaths,
  concatenateAndSaveAsEnsemble,
  spawnFeedbackScript,
  spawnRgyrDmaxScript,
  createReadmeFile
} from './bilbomd-step-functions.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import path from 'path'
import { exec } from 'node:child_process'
import { promisify } from 'util'
import { FileCopyParamsNew } from '../../types/index.js'
import { updateStepStatus } from './mongo-utils.js'

const execPromise = promisify(exec)

interface EmailMessage {
  message: string
  error?: boolean
}

const copyBilboMDResults = async (DBjob: IJob) => {
  try {
    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Running',
      'Copying results from PSCRATCH to CFS has started.'
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Running',
      'Copying results from PSCRATCH to CFS has started.'
    )

    const copyID = await executeNerscScript(
      config.scripts.copyFromScratchToCFSScript,
      DBjob.uuid
    )

    const copyResult = await monitorTaskAtNERSC(copyID)
    logger.info(`copyResult: ${JSON.stringify(copyResult)}`)

    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Success',
      'Copying results from PSCRATCH to CFS successful.'
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Success',
      'Copying results from PSCRATCH to CFS successful.'
    )
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateSingleJobStep(
      DBjob,
      'copy_results_to_cfs',
      'Error',
      `Failed to copy BilboMD results from PSCRATCH to CFS: ${errorMessage}`
    )
    await updateSingleJobStep(
      DBjob,
      'nersc_copy_results_to_cfs',
      'Error',
      `Failed to copy BilboMD results from PSCRATCH to CFS: ${errorMessage}`
    )
    logger.error(`Error during copyBilboMDResults job: ${errorMessage}`)
  }
}

const prepareBilboMDResults = async (DBjob: IJob): Promise<void> => {
  try {
    await updateSingleJobStep(
      DBjob,
      'results',
      'Running',
      'Gathering BilboMD job results has started.'
    )

    // Ensure DBjob is one of the acceptable types before calling prepareResults
    if (
      isBilboMDCRDJob(DBjob) ||
      isBilboMDPDBJob(DBjob) ||
      isBilboMDAutoJob(DBjob) ||
      isBilboMDAlphaFoldJob(DBjob)
    ) {
      await prepareResults(DBjob)
      await updateSingleJobStep(
        DBjob,
        'results',
        'Success',
        'BilboMD job results gathered successfully.'
      )
    } else {
      throw new Error('Invalid job type')
    }
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateSingleJobStep(
      DBjob,
      'results',
      'Error',
      `Failed to gather BilboMD results: ${errorMessage}`
    )
    logger.error(`Error during prepareBilboMDResults job: ${errorMessage}`)
  }
}

const sendBilboMDEmail = async (DBjob: IJob, message: EmailMessage): Promise<void> => {
  try {
    // Log the beginning of the process
    await updateSingleJobStep(
      DBjob,
      'email',
      'Running',
      'Cleaning up & sending email has started.'
    )

    // Perform the cleanup job and send email
    await cleanupJob(DBjob, message)

    // Log success
    await updateSingleJobStep(
      DBjob,
      'email',
      'Success',
      'Cleaning up & sending email successful.'
    )

    logger.info(
      `Email sent for job ${DBjob.nersc.jobid} with message: ${message.message}`
    )
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }

    const statusMessage = `Failed to send email: ${errorMessage}`
    // Update job status to indicate error
    await updateSingleJobStep(DBjob, 'email', 'Error', statusMessage)
    await updateSingleJobStep(DBjob, 'nersc_job_status', 'Error', statusMessage)

    logger.error(`Error during sendBilboMDEmail job: ${errorMessage}`)
  }
}

const prepareResults = async (
  DBjob: IBilboMDCRDJob | IBilboMDPDBJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob
): Promise<void> => {
  try {
    const outputDir = path.join(config.uploadDir, DBjob.uuid)
    const multiFoxsDir = path.join(outputDir, 'multifoxs')
    const logFile = path.join(multiFoxsDir, 'multi_foxs.log')
    const resultsDir = path.join(outputDir, 'results')

    // Create new empty results directory
    try {
      await makeDir(resultsDir)
    } catch (error) {
      logger.error(`Error creating results directory: ${error}`)
    }

    // Copy the minimized PDB
    await copyFiles({
      source: `${outputDir}/minimization_output.pdb`,
      destination: resultsDir,
      filename: 'minimization_output.pdb',
      isCritical: false
    })

    // Copy the DAT file for the minimized PDB
    await copyFiles({
      source: `${outputDir}/minimization_output.pdb.dat`,
      destination: resultsDir,
      filename: 'minimization_output.pdb.dat',
      isCritical: false
    })

    // Copy ensemble_size_*.txt files
    await copyFiles({
      source: `${multiFoxsDir}/ensembles_size*.txt`,
      destination: resultsDir,
      filename: 'ensembles_size*.txt',
      isCritical: false
    })

    // Copy multi_state_model_*_1_1.dat files
    await copyFiles({
      source: `${multiFoxsDir}/multi_state_model_*_1_1.dat`,
      destination: resultsDir,
      filename: 'multi_state_model_*_1_1.dat',
      isCritical: false
    })

    // Gather original uploaded files
    const filesToCopy = [
      { file: DBjob.data_file, label: 'data_file' } // Assuming data_file is common
    ]

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
          source: path.join(outputDir, file),
          destination: resultsDir,
          filename: label,
          isCritical: false
        })
      } else {
        logger.warn(`Expected file for '${label}' is undefined.`)
      }
    }

    // Only want to add N best PDBs equal to number_of_states N in logfile.
    const numEnsembles = await getNumEnsembles(logFile)
    logger.info(`prepareResults numEnsembles: ${numEnsembles}`)

    if (numEnsembles) {
      // Iterate through each ensembles_siz_*.txt file
      for (let i = 1; i <= numEnsembles; i++) {
        const ensembleFile = path.join(multiFoxsDir, `ensembles_size_${i}.txt`)
        logger.info(`prepareResults ensembleFile: ${ensembleFile}`)
        const ensembleFileContent = await fs.readFile(ensembleFile, 'utf8')
        const pdbFilesRelative = extractPdbPaths(ensembleFileContent)

        const pdbFilesFullPath = pdbFilesRelative.map((item) =>
          path.join(outputDir, item)
        )
        // Extract the first N PDB files to string[]
        const numToCopy = Math.min(pdbFilesFullPath.length, i)
        const ensembleModelFiles = pdbFilesFullPath.slice(0, numToCopy)
        const ensembleSize = ensembleModelFiles.length
        await concatenateAndSaveAsEnsemble(ensembleModelFiles, ensembleSize, resultsDir)
      }
    }

    // scripts/pipeline_decision_tree.py
    try {
      await spawnFeedbackScript(DBjob)
      logger.info(`Feedback script executed successfully`)
    } catch (error) {
      logger.error(`Error running feedback script: ${error}`)
    }

    // create the rgyr vs. dmax multifoxs ensembles plots
    try {
      await spawnRgyrDmaxScript(DBjob)
      logger.info(`Rgyr vs. Dmax script executed successfully`)
    } catch (error) {
      logger.error(`Error running Rgyr vs. Dmax script: ${error}`)
    }

    // Create Job-specific README file.
    try {
      await createReadmeFile(DBjob, numEnsembles, resultsDir)
      logger.info(`wrote README.md file`)
    } catch (error) {
      logger.error(`Error creating README file: ${error}`)
    }

    // Create the results tar.gz file
    try {
      const uuidPrefix = DBjob.uuid.split('-')[0]
      const archiveName = `results-${uuidPrefix}.tar.gz`
      await execPromise(`tar czvf ${archiveName} results`, { cwd: outputDir })
      logger.info(`created ${archiveName} file`)
    } catch (error) {
      logger.error(`Error creating tar file: ${error}`)
      throw error
    }
  } catch (error) {
    await handleError(error, DBjob, 'results')
  }
}

const cleanupJob = async (DBjob: IJob, message: EmailMessage): Promise<void> => {
  try {
    // Update MongoDB job status and completion time
    DBjob.status = 'Completed'
    DBjob.time_completed = new Date()
    await DBjob.save()

    // Retrieve the user email from the associated User model
    const user = await User.findById(DBjob.user).lean().exec()
    if (!user) {
      logger.error(`No user found for: ${DBjob.uuid}`)
      return
    }

    // Send job completion email and log the notification
    if (config.sendEmailNotifications) {
      sendJobCompleteEmail(
        user.email,
        config.bilbomdUrl,
        DBjob.id,
        DBjob.title,
        message.error
      )
      logger.info(`email notification sent to ${user.email}`)
    }
  } catch (error) {
    logger.error(`Error in cleanupJob: ${error}`)
    throw error
  }
}

const updateSingleJobStep = async (
  DBJob: IJob,
  stepName: keyof IBilboMDSteps,
  status: StepStatusEnum,
  message: string
): Promise<void> => {
  try {
    DBJob.steps[stepName] = { status, message }
    await DBJob.save()
  } catch (error) {
    logger.error(
      `Error updating step status for job ${DBJob.uuid} in step ${stepName}: ${error}`
    )
  }
}

const copyFiles = async ({
  source,
  destination,
  filename,
  isCritical
}: FileCopyParamsNew): Promise<void> => {
  try {
    await execPromise(`cp ${source} ${destination}`)
  } catch (error) {
    logger.error(`Error copying ${filename}: ${error}`)
    if (isCritical) {
      throw new Error(`Critical error copying ${filename}: ${error}`)
    }
  }
}

const makeDir = async (directory: string) => {
  await fs.ensureDir(directory)
  logger.info(`Create Dir: ${directory}`)
}

const handleError = async (
  error: Error | unknown,
  DBJob: IJob,
  step?: keyof IBilboMDSteps
) => {
  const errorMsg = step || (error instanceof Error ? error.message : String(error))

  // Updates top level job status in MongoDB
  DBJob.status = 'Error'
  // Update the specific step status
  if (step) {
    const status: IStepStatus = {
      status: 'Error',
      message: `Error in step ${step}: ${errorMsg}`
    }
    await updateStepStatus(DBJob, step, status)
  } else {
    logger.error(`Step not provided or invalid when handling error: ${errorMsg}`)
  }

  logger.error(`handleError errorMsg: ${errorMsg}`)

  throw new Error('BilboMD failed')
}

export { copyBilboMDResults, prepareBilboMDResults, sendBilboMDEmail }
