import * as dotenv from 'dotenv'
import express from 'express'
import { connectDB } from './helpers/db.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from './helpers/loggers.js'
import { config } from './config/config.js'
import { createBilboMdWorker } from './workers/bilboMdWorker.js'
import { createMovieWorker } from './workers/movieWorker.js'
import { createMultiMDWorker } from './workers/multiMdWorker.js'
import { checkNERSC } from './workers/workerControl.js'
import { monitorAndCleanupJobs } from './workers/bilboMdNerscJobMonitor.js'
import { redis } from './queues/redisConn.js'

dotenv.config()

const environment: string = process.env.NODE_ENV || 'development'
const version: string = process.env.BILBOMD_WORKER_VERSION || '0.0.0'
const gitHash: string = process.env.BILBOMD_WORKER_GIT_HASH || '321cba'

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

if (environment === 'production') {
  logger.info('Running in production mode')
} else {
  logger.info('Running in development mode')
}

connectDB()

let bilboMdWorker: Worker | null = null
let movieWorker: Worker | null = null
let multimdWorker: Worker | null = null

// 9000000 is 2 hours and 30 minutes
const workerOptions: WorkerOptions = {
  connection: redis,
  concurrency: config.runOnNERSC ? 50 : 1,
  // lockDuration: config.runOnNERSC ? 9000000 : 9000000
  lockDuration: 60_000,
  lockRenewTime: 30_000
}

const movieWorkerOptions: WorkerOptions = {
  connection: redis,
  concurrency: 1
}

const multimdWorkerOptions: WorkerOptions = {
  connection: redis,
  concurrency: 1
}

const startWorkers = async () => {
  const systemName = config.runOnNERSC ? 'NERSC' : 'Hyperion/Epyc'
  logger.info(`Attempting to start workers on ${systemName}...`)

  // Create workers only if they are not already initialized
  if (!bilboMdWorker || !movieWorker || !multimdWorker) {
    // If running on NERSC, check credentials before starting workers
    if (config.runOnNERSC) {
      logger.info('Checking NERSC credentials...')
      if (!(await checkNERSC())) {
        logger.info(
          'NERSC is not ready; workers will be started when credentials are valid'
        )
        return // Exit if credentials are not valid
      }
    }

    // Create workers
    bilboMdWorker = createBilboMdWorker(workerOptions)
    logger.info(`BilboMD Worker started on ${systemName}`)

    movieWorker = createMovieWorker(movieWorkerOptions)
    logger.info(`Movie Worker started on ${systemName}`)

    multimdWorker = createMultiMDWorker(multimdWorkerOptions)
    logger.info(`MultiMD Worker started on ${systemName}`)
  } else {
    logger.info('Workers are already initialized')
  }
}

// Define the workers array
const workers = [
  { getWorker: () => bilboMdWorker, name: 'BilboMD Worker' },
  { getWorker: () => movieWorker, name: 'Movie Worker' },
  { getWorker: () => multimdWorker, name: 'MultiMD Worker' }
]

// Store interval IDs for cleanup
const intervals: NodeJS.Timeout[] = []

if (config.runOnNERSC) {
  // Setup periodic NERSC token validation
  const tokenCheckInterval = setInterval(async () => {
    if (await checkNERSC()) {
      // Start workers if they are not initialized
      if (!bilboMdWorker || !movieWorker) {
        await startWorkers()
      } else {
        // Resume workers if they are paused
        for (const { getWorker, name } of workers) {
          const workerInstance = getWorker()
          if (workerInstance && (await workerInstance.isPaused())) {
            await workerInstance.resume()
            logger.info(`${name} resumed`)
          }
        }
      }
    } else {
      // If NERSC token is invalid, pause the workers
      for (const { getWorker, name } of workers) {
        const workerInstance = getWorker()
        if (workerInstance && !(await workerInstance.isPaused())) {
          await workerInstance.pause()
          logger.info(`${name} paused due to invalid NERSC tokens`)
        }
      }
    }
  }, 300000) // Check every 300 seconds i.e. 5 minutes
  intervals.push(tokenCheckInterval)

  // Start monitoring and cleanup process
  logger.info('Starting the monitoring and cleanup process...')
  let isMonitoring = false
  const monitoringInterval = setInterval(async () => {
    if (isMonitoring) {
      logger.info('Monitoring already in progress, skipping this interval.')
      return
    }
    isMonitoring = true
    try {
      await monitorAndCleanupJobs()
    } catch (error) {
      logger.error(
        `Monitoring and cleanup process failed: ${getErrorMessage(error)}`
      )
    } finally {
      isMonitoring = false
    }
  }, 60000)
  intervals.push(monitoringInterval)
}

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`)

  // Clear all intervals
  intervals.forEach((interval) => clearInterval(interval))
  logger.info('Cleared all intervals')

  // Close workers
  try {
    if (bilboMdWorker) {
      await bilboMdWorker.close()
      logger.info('BilboMD Worker closed')
    }
    if (movieWorker) {
      await movieWorker.close()
      logger.info('Movie Worker closed')
    }
    if (multimdWorker) {
      await multimdWorker.close()
      logger.info('MultiMD Worker closed')
    }
  } catch (error) {
    logger.error(`Error closing workers: ${getErrorMessage(error)}`)
  }

  // Close Redis connection
  try {
    await redis.quit()
    logger.info('Redis connection closed')
  } catch (error) {
    logger.error(`Error closing Redis: ${getErrorMessage(error)}`)
  }

  logger.info('Graceful shutdown complete')
  process.exit(0)
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start the workers initially
startWorkers().catch((error) => {
  logger.error(`Failed to start workers: ${getErrorMessage(error)}`)
  process.exit(1)
})

const app = express()

// Endpoint to return configuration info
app.get('/config', (req, res) => {
  const configs = {
    gitHash: gitHash || '',
    version: version || ''
  }
  res.json(configs)
})

// Start the Express server
const PORT = 3000
logger.info('Starting the Express server...')
app.listen(PORT, () => {
  logger.info(`Worker configuration server running on port ${PORT}`)
})
