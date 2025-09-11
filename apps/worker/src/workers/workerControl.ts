import { Worker } from 'bullmq'
import { logger } from '../helpers/loggers.js'
import { ensureValidToken } from '../services/functions/nersc-api-token-functions.js'

// Define types for clarity
type WorkerInfo = {
  worker: Worker
  name: string
}

export const pauseProcessing = async (workers: WorkerInfo[]) => {
  for (const { worker, name } of workers) {
    if (worker) {
      await worker.pause()
      logger.info(`${name} paused due to invalid NERSC tokens`)
    }
  }
}

export const resumeProcessing = async (workers: WorkerInfo[]) => {
  for (const { worker, name } of workers) {
    if (worker) {
      await worker.resume()
      logger.info(`${name} resumed`)
    }
  }
}

export const checkNERSC = async () => {
  try {
    // Eventually could have various checks here.

    // Perlmutter status
    // const response = await someAPI.healthCheck()
    // if (response.status !== 'ok') {
    //   throw new Error('API is not healthy')
    // }

    // Valid client

    // Able to get access token
    const token: string = await ensureValidToken()
    if (typeof token === 'string' && token.length > 10) {
      logger.info(`Successfully obtained NERSC token: ${token.slice(0, 10)}...`)
      return true
    } else {
      logger.warn(`Did not successfully obtain NERSC token: ${token}`)
      return false
    }
  } catch (error) {
    logger.error(`Failed to obtain NERSC token: ${error}`)
    return false
  }
}
