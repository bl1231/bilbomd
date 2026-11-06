import * as dotenv from 'dotenv'
import express from 'express'
import { connectDB } from './helpers/db.js'
import { Worker, WorkerOptions } from 'bullmq'
import { logger } from './helpers/loggers.js'
import { config } from './config/config.js'
import {
  WORKER_CONCURRENCY,
  LOCK_SETTINGS,
  INTERVALS,
  SERVER
} from './config/constants.js'
import { createBilboMdWorker } from './workers/bilboMdWorker.js'
import { createMovieWorker } from './workers/movieWorker.js'
import { createMultiMDWorker } from './workers/multiMdWorker.js'
import { checkNERSC } from './workers/workerControl.js'
import { monitorAndCleanupJobs } from './workers/bilboMdNerscJobMonitor.js'
import { redis } from './queues/redisConn.js'
import { startCancelListener } from './workers/cancelListener.js'
import { configureJobEvents } from './helpers/jobEvents.js'
import { getErrorMessage } from './helpers/errors.js'

dotenv.config()

const environment: string = process.env.NODE_ENV || 'development'
const version: string = process.env.BILBOMD_WORKER_VERSION || '0.0.0'
const gitHash: string = process.env.BILBOMD_WORKER_GIT_HASH || '321cba'

if (environment === 'production') {
  logger.info('Running in production mode')
} else {
  logger.info('Running in development mode')
}

connectDB()

let bilboMdWorker: Worker | null = null
let movieWorker: Worker | null = null
let multimdWorker: Worker | null = null

const onK8s = config.executionBackend === 'k8s'

// On Kubernetes a job keeps running in its own pod while the dispatcher
// restarts (e.g. on upgrade). Its BullMQ job stalls and is picked up again,
// and the handler adopts the running Kubernetes Job, so allow several stalls
// before BullMQ gives up on it.
const K8S_MAX_STALLED_COUNT = 10

const workerOptions: WorkerOptions = {
  connection: redis,
  concurrency: config.runOnNERSC
    ? WORKER_CONCURRENCY.NERSC
    : onK8s
      ? config.k8s.maxJobs
      : WORKER_CONCURRENCY.LOCAL,
  lockDuration: LOCK_SETTINGS.DURATION,
  lockRenewTime: LOCK_SETTINGS.RENEW_TIME,
  ...(onK8s ? { maxStalledCount: K8S_MAX_STALLED_COUNT } : {})
}

const movieWorkerOptions: WorkerOptions = {
  connection: redis,
  concurrency: WORKER_CONCURRENCY.MOVIE
}

const multimdWorkerOptions: WorkerOptions = {
  connection: redis,
  concurrency: WORKER_CONCURRENCY.MULTI_MD,
  ...(onK8s
    ? {
        lockDuration: LOCK_SETTINGS.DURATION,
        lockRenewTime: LOCK_SETTINGS.RENEW_TIME,
        maxStalledCount: K8S_MAX_STALLED_COUNT
      }
    : {})
}

const startWorkers = async () => {
  const systemName = config.runOnNERSC
    ? 'NERSC'
    : onK8s
      ? 'Kubernetes'
      : 'Hyperion/Epyc'
  logger.info(`Attempting to start workers on ${systemName}...`)
  logger.info(`Execution backend: ${config.executionBackend}`)
  if (onK8s) {
    logger.info(
      `Kubernetes Jobs in namespace ${config.k8s.namespace}, image ${config.k8s.jobImage}, at most ${config.k8s.maxJobs} at once`
    )
  }

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

// Tell the backend (and the UI) when jobs change. Publishing works on the
// shared connection; only subscribing needs a dedicated one.
configureJobEvents(redis)

// Listen for cancel requests (e.g. a user deleting a running job). Pub/sub
// needs a dedicated connection.
let stopCancelListener: (() => Promise<void>) | null = null
startCancelListener(redis.duplicate())
  .then((stop) => {
    stopCancelListener = stop
  })
  .catch((error) => {
    logger.error(`Failed to start cancel listener: ${getErrorMessage(error)}`)
  })

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
  }, INTERVALS.TOKEN_CHECK)
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
  }, INTERVALS.JOB_MONITORING)
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
    // On Kubernetes the handlers only watch Jobs that keep running without
    // them, so don't wait (possibly hours) for them to return; the next
    // dispatcher adopts the Jobs.
    if (bilboMdWorker) {
      await bilboMdWorker.close(onK8s)
      logger.info('BilboMD Worker closed')
    }
    if (movieWorker) {
      await movieWorker.close()
      logger.info('Movie Worker closed')
    }
    if (multimdWorker) {
      await multimdWorker.close(onK8s)
      logger.info('MultiMD Worker closed')
    }
  } catch (error) {
    logger.error(`Error closing workers: ${getErrorMessage(error)}`)
  }

  // Close Redis connections
  try {
    await stopCancelListener?.()
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
logger.info('Starting the Express server...')
app.listen(SERVER.PORT, () => {
  logger.info(`Worker configuration server running on port ${SERVER.PORT}`)
})
