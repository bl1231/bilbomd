import path from 'path'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import qs from 'qs'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { NERSC_RETRY, INTERVALS, NERSC_PATHS } from '../../config/constants.js'
import { IJob } from '@bilbomd/mongodb-schema'
import { ensureValidToken } from './nersc-api-token-functions.js'
import { TaskStatusResponse } from '../../types/nersc.js'

const environment: string = process.env.NODE_ENV || 'development'

// Configure axios to retry on failure
axiosRetry(axios, {
  retries: NERSC_RETRY.MAX_ATTEMPTS,
  retryDelay: axiosRetry.exponentialDelay
})

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
  const logFile = `${NERSC_PATHS.SCRIPT_LOGS_DIR}/${scriptBaseName}-${new Date().toISOString()}.log`
  const cmd = `ENVIRONMENT=${environment} ${scriptName} ${scriptArgs} > ${logFile} 2>&1`
  logger.info(`Executing command: ${cmd}`)

  const data = qs.stringify({
    executable: `bash -c "${cmd}"`
  })

  try {
    const response = await axios.post(url, data, { headers })
    logger.info(
      `Script executed successfully: ${JSON.stringify(response.data)}`
    )
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
    logger.info(
      `Job submitted to Superfacility API: ${JSON.stringify(response.data)}`
    )
    return response.data.task_id
  } catch (error) {
    logger.error(`Failed to Submit BilboMD Job to Superfacility API: ${error}`)
    throw error
  }
}

const monitorTaskAtNERSC = async (
  taskID: string
): Promise<TaskStatusResponse> => {
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
    await new Promise((resolve) =>
      setTimeout(resolve, INTERVALS.NERSC_TASK_POLL)
    )
  } while (status !== 'completed' && status !== 'failed')

  if (!statusResponse) {
    throw new Error('Failed to get a response from the NERSC API')
  }

  return statusResponse
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

export {
  executeNerscScript,
  submitJobToNersc,
  monitorTaskAtNERSC,
  getSlurmStatusFile
}
