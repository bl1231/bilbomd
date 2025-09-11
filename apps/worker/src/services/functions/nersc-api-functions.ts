import path from 'path'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import qs from 'qs'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import {
  IBilboMDSteps,
  IJob,
  IStepStatus,
  StepStatusEnum
} from '@bl1231/bilbomd-mongodb-schema'
import { ensureValidToken } from './nersc-api-token-functions.js'
import { TaskStatusResponse, JobStatusResponse } from '../../types/nersc.js'
import { updateStepStatus } from './mongo-utils.js'
import { Job as BullMQJob } from 'bullmq'

const environment: string = process.env.NODE_ENV || 'development'

const stepWeights: { [key: string]: number } = {
  alphafold: 20,
  pdb2crd: 5,
  pae: 5,
  autorg: 5,
  minimize: 10,
  initfoxs: 5,
  heat: 10,
  md: 30,
  dcd2pdb: 10,
  foxs: 10,
  multifoxs: 10,
  copy_results_to_cfs: 5,
  results: 3,
  email: 1,
  nersc_prepare_slurm_batch: 5,
  nersc_submit_slurm_batch: 5,
  nersc_job_status: 5,
  nersc_copy_results_to_cfs: 5
}

// Configure axios to retry on failure
axiosRetry(axios, { retries: 11, retryDelay: axiosRetry.exponentialDelay })

const executeNerscScript = async (
  scriptName: string,
  scriptArgs: string
): Promise<string> => {
  const token = await ensureValidToken()

  const url = `${config.nerscBaseAPI}/utilities/command/perlmutter`

  const headers = {
    accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Bearer ${token}`
  }
  const scriptBaseName = path.basename(scriptName)
  // /global/homes/${username_first_letter}/${username}/script-logs/${scriptBaseName}-${new Date().toISOString()}.log
  const logFile = `/global/homes/s/sclassen/script-logs/${scriptBaseName}-${new Date().toISOString()}.log`
  const cmd = `ENVIRONMENT=${environment} ${scriptName} ${scriptArgs} > ${logFile} 2>&1`
  logger.info(`Executing command: ${cmd}`)

  const data = qs.stringify({
    executable: `bash -c "${cmd}"`
  })

  try {
    const response = await axios.post(url, data, { headers })
    logger.info(`Script executed successfully: ${JSON.stringify(response.data)}`)
    return response.data.task_id
  } catch (error) {
    logger.error(`Error executing script on NERSC: ${error}`)
    throw error
  }
}

const submitJobToNersc = async (Job: IJob): Promise<string> => {
  const UUID = Job.uuid
  const token = await ensureValidToken()
  const url = `${config.nerscBaseAPI}/compute/jobs/perlmutter`
  const headers = {
    accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Bearer ${token}`
  }
  const slurmFile = `${config.nerscWorkDir}/${UUID}/bilbomd.slurm`
  const data = qs.stringify({
    isPath: 'true',
    job: slurmFile,
    args: UUID
  })

  try {
    const response = await axios.post(url, data, { headers })
    logger.info(`Job submitted to Superfacility API: ${JSON.stringify(response.data)}`)
    return response.data.task_id
  } catch (error) {
    logger.error(`Failed to Submit BilboMD Job to Superfacility API: ${error}`)
    throw error
  }
}

const monitorTaskAtNERSC = async (taskID: string): Promise<TaskStatusResponse> => {
  let token = await ensureValidToken()
  const url = `${config.nerscBaseAPI}/tasks/${taskID}`
  // logger.info(`monitorTaskAtNERSC url: ${url}`)

  let status = 'PENDING'
  let statusResponse: TaskStatusResponse | undefined

  const makeRequest = async () => {
    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${token}`
    }

    try {
      const response = await axios.get(url, { headers })
      // logger.info(`monitorTask: ${JSON.stringify(response.data)}`)
      statusResponse = {
        id: response.data.id,
        status: response.data.status,
        result: response.data.result
      }
      status = statusResponse.status
      const taskid = statusResponse.id
      logger.info(`monitorTaskAtNERSC taskid: ${taskid} status: ${status}`)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Now we can assume error is an AxiosError and access specific properties like error.response
        if (error.response && error.response.status === 403) {
          logger.error(`monitorTaskAtNERSC error: ${error}`)
          // Check if the error is due to token expiration
          token = await ensureValidToken(true) // Refresh the token
          await makeRequest() // Retry the request with the new token
        } else {
          logger.error(`Axios error monitoring task: ${error.message}`)
          throw error
        }
      } else {
        logger.error(`Non-Axios error monitoring task: ${error}`)
        throw error // Re-throw if it's not an Axios error
      }
    }
  }

  do {
    await makeRequest()
    await new Promise((resolve) => setTimeout(resolve, 2000))
  } while (status !== 'completed' && status !== 'failed')

  if (!statusResponse) {
    throw new Error('Failed to get a response from the NERSC API')
  }

  return statusResponse
}

const monitorJobAtNERSC = async (
  MQJob: BullMQJob,
  DBJob: IJob,
  jobID: string
): Promise<JobStatusResponse> => {
  let jobStatus = 'pending'
  const url = `${config.nerscBaseAPI}/compute/jobs/perlmutter/${jobID}?sacct=true`
  logger.info(`monitorJobAtNERSC url: ${url}`)

  let continueMonitoring = true // Control variable for the loop
  let statusResponse: JobStatusResponse = {
    api_status: 'PENDING',
    api_error: ''
  }

  const maxRetries = 10 // Maximum number of retries for failed attempts
  const maxIterations = 1440 // 1440 x 60s = 24 hours
  let retryCount = 0
  let iterationCount = 0

  while (continueMonitoring && iterationCount < maxIterations) {
    const token = await ensureValidToken() // Fetch or refresh the token before each request
    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${token}`
    }

    try {
      const response = await axios.get(url, { headers })
      if (response.data.output && response.data.output.length > 0) {
        const jobDetails = response.data.output[0]
        jobStatus = jobDetails.state
        // Update the step status in MongoDB
        const status: IStepStatus = {
          status: 'Running',
          message: jobStatus
        }
        await updateStepStatus(DBJob, 'nersc_job_status', status)
        statusResponse = {
          api_status: response.data.status,
          api_error: response.data.error,
          sacct_jobid: jobDetails.jobid,
          sacct_state: jobStatus,
          sacct_submit: jobDetails.submit,
          sacct_start: jobDetails.start,
          sacct_end: jobDetails.end
        }
        retryCount = 0 // Reset retry count on successful attempt
      }
      logger.info(
        `Current job ${jobID} status: ${jobStatus} iteration: ${iterationCount}`
      )

      if (jobStatus === 'RUNNING') {
        await updateStatus(MQJob, DBJob)
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        logger.info('Token may have expired, refreshing token...')
        retryCount++ // Increment retry count on failed attempt
        if (retryCount >= maxRetries) {
          logger.error(`Max retries reached for job ${jobID}`)
          throw new Error(`Max retries reached for job ${jobID}`)
        }
        continue // Force token refresh on the next iteration if token has expired
      } else {
        logger.error(`Error monitoring job at NERSC: ${error}`)
        retryCount++ // Increment retry count on failed attempt
        if (retryCount >= maxRetries) {
          logger.error(`Max retries reached for job ${jobID}`)
          throw new Error(`Max retries reached for job ${jobID}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 60000)) // Wait before retrying
        continue // Retry the request
      }
    }

    // monitoring will continue for:
    // PENDING
    // RUNNING
    // ...and presumably any other Slurm statuses of which I am unaware.
    switch (true) {
      case jobStatus.includes('COMPLETED'):
      case jobStatus.includes('FAILED'):
      case jobStatus.includes('DEADLINE'):
      case jobStatus.includes('TIMEOUT'):
      case jobStatus.includes('CANCELLED'):
      case jobStatus.includes('NODE_FAIL'):
      case jobStatus.includes('OUT_OF_MEMORY'):
      case jobStatus.includes('PREEMPTED'):
        continueMonitoring = false // Stop monitoring if any of these statuses are met
        // one final update of the status.txt file?
        await updateStatus(MQJob, DBJob)
        break
      default:
        iterationCount++
        await new Promise((resolve) => setTimeout(resolve, 60000)) // Continue polling otherwise
        break
    }
  }
  if (iterationCount >= maxIterations) {
    logger.error(`Max iterations reached for job ${jobID}`)
  }
  return statusResponse
}

const getSlurmOutFile = async (UUID: string, jobID: string): Promise<string> => {
  const token = await ensureValidToken()
  const path = `${config.nerscWorkDir}/${UUID}/slurm-${jobID}.out`
  const url = `${config.nerscBaseAPI}/utilities/download/perlmutter/${encodeURIComponent(
    path
  )}`

  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`
  }
  const params = {
    binary: 'false'
  }
  try {
    const response = await axios.get(url, { headers, params })
    // {
    //   "status": "OK",
    //   "file": "string",
    //   "is_binary": false,
    //   "error": "string"
    // }
    if (response.data.status !== 'OK') {
      logger.error(`Error retrieving file: ${response.data.error}`)
      throw new Error(`Error retrieving file: ${response.data.error}`)
    }
    // logger.info(`File retrieved successfully.`)
    return response.data.file // Return the content of the file as a string
  } catch (error) {
    logger.error(`Failed to download file: ${error}`)
    throw error
  }
}

const getSlurmStatusFile = async (UUID: string): Promise<string> => {
  const token = await ensureValidToken()
  const path = `${config.nerscWorkDir}/${UUID}/status.txt`
  const url = `${config.nerscBaseAPI}/utilities/download/perlmutter/${encodeURIComponent(
    path
  )}`

  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`
  }
  const params = {
    binary: 'false'
  }
  try {
    const response = await axios.get(url, { headers, params })
    // {
    //   "status": "OK",
    //   "file": "string",
    //   "is_binary": false,
    //   "error": "string"
    // }
    if (response.data.status !== 'OK') {
      logger.error(`Error retrieving file: ${response.data.error}`)
      throw new Error(`Error retrieving file: ${response.data.error}`)
    }
    // logger.info(`File retrieved successfully.`)
    return response.data.file // Return the content of the file as a string
  } catch (error) {
    logger.error(`Failed to download file: ${error}`)
    throw new Error(`Failed to download file after 3 retries: ${error}`)
  }
}

const updateStatus = async (MQjob: BullMQJob, DBJob: IJob) => {
  const UUID = DBJob.uuid
  const contents: string = await getSlurmStatusFile(UUID)
  const lines = contents.split('\n')

  lines.forEach((line) => {
    const [step, status] = line.split(':').map((part) => part.trim())
    if (step in DBJob.steps) {
      const key = step as keyof IBilboMDSteps // Assert that step is a valid key of IBilboMDSteps
      DBJob.steps[key] = {
        status: status as StepStatusEnum,
        message: status
      }
    }
  })

  try {
    await DBJob.save()
    const progress = calculateProgress(DBJob.steps)
    await MQjob.updateProgress(progress)
  } catch (error) {
    logger.error(`Unable to save job status for ${DBJob._id}: ${error}`)
    throw error
  }
}

const calculateProgress = (steps: IBilboMDSteps): number => {
  if (!steps || Object.keys(steps).length === 0) {
    logger.warn('Steps are empty or undefined.')
    return 20 // Minimum progress
  }

  logger.info('Printing all steps and their statuses:')
  for (const [step, value] of Object.entries(steps)) {
    logger.info(
      `Step: ${step}, Status: ${value?.status || 'Undefined'}, Message: ${
        value?.message || 'None'
      }`
    )
  }

  const totalWeight = Object.values(stepWeights).reduce((acc, weight) => acc + weight, 0)
  if (totalWeight === 0) {
    logger.error('Total weight is zero. Check stepWeights configuration.')
    return 20 // Minimum progress
  }

  let completedWeight = 0

  // Iterate only over valid keys in `steps` that exist in `stepWeights`
  for (const step of Object.keys(steps).filter((key) => key in stepWeights)) {
    const status = steps[step as keyof IBilboMDSteps]?.status

    logger.info(`Step: ${step}, Status: ${status}`)

    if (status === 'Success') {
      const weight = stepWeights[step] || 0
      completedWeight += weight
    }
  }

  logger.info(`Completed Weight: ${completedWeight}, Total Weight: ${totalWeight}`)

  // Calculate progress
  const progress = (completedWeight / totalWeight) * 70 + 20 // Scale between 20% and 90%
  return Math.min(progress, 90) // Ensure it doesn't exceed 90%
}

export {
  executeNerscScript,
  submitJobToNersc,
  monitorTaskAtNERSC,
  monitorJobAtNERSC,
  getSlurmOutFile,
  getSlurmStatusFile,
  calculateProgress
}
