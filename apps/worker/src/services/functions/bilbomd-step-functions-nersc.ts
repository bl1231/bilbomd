import { config } from '../../config/config.js'
import { Job as BullMQJob } from 'bullmq'
import {
  IJob,
  IStepStatus,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDSteps,
  StepStatusEnum
} from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import {
  executeNerscScript,
  submitJobToNersc,
  monitorTaskAtNERSC,
  monitorJobAtNERSC
} from './nersc-api-functions.js'
import { prepareResults } from './bilbomd-step-functions.js'
import { cleanupJob } from './job-utils.js'

interface INerscTaskResult {
  id: string
  status: 'completed' | 'failed' | 'running' | 'pending' | string
  result:
    | string
    | {
        status: 'ok' | 'error' | string
        output: string
        error: string
      }
}

// Define some useful type guard functions
function isBilboMDCRDJob(job: IJob): job is IBilboMDCRDJob {
  return (job as IBilboMDCRDJob).crd_file !== undefined
}

function isBilboMDPDBJob(job: IJob): job is IBilboMDPDBJob {
  return (job as IBilboMDPDBJob).pdb_file !== undefined
}

function isBilboMDAutoJob(job: IJob): job is IBilboMDAutoJob {
  return (job as IBilboMDAutoJob).pae_file !== undefined
}

function isBilboMDAlphaFoldJob(job: IJob): job is IBilboMDAlphaFoldJob {
  return (job as IBilboMDAlphaFoldJob).alphafold_entities !== undefined
}

const updateNerscSpecificSteps = async (DBJob: IJob): Promise<void> => {
  logger.info(`Updating NERSC-specific steps for job: ${DBJob.uuid}`)
  // Ensure the steps object exists
  if (!DBJob.steps) {
    DBJob.steps = {} as IBilboMDSteps
  }

  // Add NERSC-specific steps if they are missing
  DBJob.steps.nersc_prepare_slurm_batch = DBJob.steps.nersc_prepare_slurm_batch || {
    status: 'Waiting',
    message: 'Step not started'
  }

  DBJob.steps.nersc_submit_slurm_batch = DBJob.steps.nersc_submit_slurm_batch || {
    status: 'Waiting',
    message: 'Step not started'
  }

  DBJob.steps.nersc_job_status = DBJob.steps.nersc_job_status || {
    status: 'Waiting',
    message: 'Step not started'
  }

  DBJob.steps.nersc_copy_results_to_cfs = DBJob.steps.nersc_copy_results_to_cfs || {
    status: 'Waiting',
    message: 'Waiting until job is completed'
  }

  DBJob.steps.copy_results_to_cfs = DBJob.steps.copy_results_to_cfs || {
    status: 'Waiting',
    message: 'Waiting until job is completed'
  }

  // Save the job document to persist the changes
  await DBJob.save()
  logger.info(`Updated NERSC-specific steps for job: ${DBJob.uuid}`)
}

const makeBilboMDSlurm = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  const stepName = 'nersc_prepare_slurm_batch'
  try {
    await MQjob.log('start nersc prepare slurm batch')
    await updateJobStatus(
      DBjob,
      stepName,
      'Running',
      'Preparation of Slurm batch file has started.'
    )

    const mdEngine = DBjob.md_engine;
    logger.info(`MD engine: ${mdEngine}`);
    const prepSlurmScript = mdEngine === 'OpenMM'
      ? config.scripts.prepareOMMSlurmScript
      : config.scripts.prepareCHARMMSlurmScript;
    logger.info(`Using prepSlurmScript: ${prepSlurmScript}`);
    const prepTaskID = await executeNerscScript(prepSlurmScript, DBjob.uuid);

    const prepResult: INerscTaskResult = await monitorTaskAtNERSC(prepTaskID)
    logger.info(`prepResult: ${JSON.stringify(prepResult)}`)

    if (prepResult.status === 'completed') {
      let resultData

      if (typeof prepResult.result === 'string') {
        try {
          resultData = JSON.parse(prepResult.result)
        } catch (parseError) {
          logger.error(`Failed to parse result JSON: ${parseError}`)
          throw new Error(`Failed to parse result JSON: ${prepResult.result}`)
        }
      } else {
        resultData = prepResult.result
      }

      if (resultData && resultData.status === 'ok') {
        await updateJobStatus(
          DBjob,
          stepName,
          'Success',
          'Slurm batch file prepared successfully.'
        )
      } else {
        let errorMessage = `Task failed with status: ${prepResult.status}`
        if (resultData && resultData.error) {
          errorMessage += `, error: ${resultData.error}`
        }
        await updateJobStatus(DBjob, stepName, 'Error', errorMessage)
        throw new Error(errorMessage)
      }
    } else {
      const errorMessage = `Unexpected task status: ${prepResult.status}`
      await updateJobStatus(DBjob, stepName, 'Error', errorMessage)
      throw new Error(errorMessage)
    }

    await MQjob.log('end nersc prepare slurm batch')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateJobStatus(
      DBjob,
      stepName,
      'Error',
      `Failed to prepare Slurm batch file: ${errorMessage}`
    )
    logger.error(`Error during preparation of Slurm batch: ${errorMessage}`)
  }
}

const submitBilboMDSlurm = async (MQjob: BullMQJob, DBjob: IJob): Promise<string> => {
  const stepName = 'nersc_submit_slurm_batch'
  try {
    await MQjob.log('start nersc submit slurm batch')
    await updateJobStatus(DBjob, stepName, 'Running', 'Submitting Slurm batch file')

    const submitTaskID = await submitJobToNersc(DBjob)
    const submitResult = await monitorTaskAtNERSC(submitTaskID)
    logger.info(`submitResult: ${JSON.stringify(submitResult)}`)

    const submitResultObject = JSON.parse(submitResult.result)
    const nerscJobID = submitResultObject.jobid
    logger.info(`NERSC JOBID: ${nerscJobID}`)

    // Populate the `nersc` field in the `DBjob`
    // Setting nersc.status to 'PENDING' will allow the job to be monitored
    DBjob.nersc = {
      jobid: nerscJobID,
      state: 'PENDING',
      qos: undefined,
      time_submitted: new Date(),
      time_started: undefined,
      time_completed: undefined
    }

    await updateJobStatus(DBjob, stepName, 'Success', `NERSC JobID ${nerscJobID}`)
    await MQjob.log('end nersc submit slurm batch')
    return nerscJobID
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateJobStatus(
      DBjob,
      stepName,
      'Error',
      `Failed to submit Slurm batch file: ${errorMessage}`
    )
    logger.error(`Error during submission of Slurm batch: ${errorMessage}`)
    throw new Error(`Failed to submit Slurm batch file: ${errorMessage}`)
  }
}

const monitorBilboMDJob = async (
  MQjob: BullMQJob,
  DBjob: IJob,
  Pjob: string
): Promise<void> => {
  try {
    await MQjob.log('start nersc watch job')
    await updateJobStatus(DBjob, 'nersc_job_status', 'Running', 'Watching BilboMD Job')

    const jobResult = await monitorJobAtNERSC(MQjob, DBjob, Pjob)
    logger.info(`jobResult: ${JSON.stringify(jobResult)}`)

    await updateJobStatus(
      DBjob,
      'nersc_job_status',
      'Success',
      'BilboMD job on Perlmutter has finished successfully.'
    )
    await MQjob.log('end nersc watch job')
  } catch (error) {
    let errorMessage = 'Unknown error'
    let errorStack = ''

    if (error instanceof Error) {
      errorMessage = error.message
      errorStack = error.stack || ''
    }

    await updateJobStatus(
      DBjob,
      'nersc_job_status',
      'Error',
      `Failed to monitor BilboMD job: ${errorMessage}`
    )
    logger.error(`Error during monitoring of BilboMD job: ${errorStack}`)
  }
}

const prepareBilboMDResults = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    await updateJobStatus(
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
      await prepareResults(MQjob, DBjob)
      await updateJobStatus(
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
    await updateJobStatus(
      DBjob,
      'results',
      'Error',
      `Failed to gather BilboMD results: ${errorMessage}`
    )
    logger.error(`Error during prepareBilboMDResults job: ${errorMessage}`)
  }
}

const copyBilboMDResults = async (MQjob: BullMQJob, DBjob: IJob) => {
  try {
    await updateJobStatus(
      DBjob,
      'copy_results_to_cfs',
      'Running',
      'Copying results from pscratch to CFS has started.'
    )
    await MQjob.log('start copy from pscratch to cfs')
    const copyID = await executeNerscScript(
      config.scripts.copyFromScratchToCFSScript,
      DBjob.uuid
    )
    const copyResult = await monitorTaskAtNERSC(copyID)
    logger.info(`copyResult: ${JSON.stringify(copyResult)}`)
    await updateJobStatus(
      DBjob,
      'copy_results_to_cfs',
      'Success',
      'Copying results from pscratch to CFS successful.'
    )
    await MQjob.log('end copy from pscratch to cfs')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    await updateJobStatus(
      DBjob,
      'copy_results_to_cfs',
      'Error',
      `Failed to copy BilboMD results from pscratch to cfs: ${errorMessage}`
    )
    logger.error(`Error during copyBilboMDResults job: ${errorMessage}`)
  }
}

const sendBilboMDEmail = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    await updateJobStatus(
      DBjob,
      'email',
      'Running',
      'Cleaning up & sending email has started.'
    )
    await cleanupJob(MQjob, DBjob)
    await updateJobStatus(
      DBjob,
      'email',
      'Success',
      'Cleaning up & sending email successful.'
    )
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    const statusMessage = `Failed to send email: ${errorMessage}`
    await updateJobStatus(DBjob, 'email', 'Error', statusMessage)
    await updateJobStatus(DBjob, 'nersc_job_status', 'Error', statusMessage)
    logger.error(`Error during sendBilboMDEmail job: ${errorMessage}`)
  }
}

const updateJobStatus = async (
  job: IJob,
  stepName: keyof IBilboMDSteps,
  status: StepStatusEnum,
  message: string
): Promise<void> => {
  const stepStatus: IStepStatus = {
    status,
    message
  }
  await updateStepStatus(job, stepName, stepStatus)
}

export {
  updateNerscSpecificSteps,
  makeBilboMDSlurm,
  submitBilboMDSlurm,
  monitorBilboMDJob,
  copyBilboMDResults,
  prepareBilboMDResults,
  sendBilboMDEmail,
  isBilboMDCRDJob,
  isBilboMDPDBJob,
  isBilboMDAutoJob,
  isBilboMDAlphaFoldJob
}
