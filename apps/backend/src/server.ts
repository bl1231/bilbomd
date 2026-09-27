import app from './app.js'
import { logger } from './middleware/loggers.js'
import { redis } from './queues/redisConn.js'
import {
  startJobEventSubscriber,
  closeAllJobEventClients
} from './services/jobEvents.js'

const PORT = 3500

const server = app.listen(PORT, () =>
  logger.info(`BilboMD server starting on port ${PORT}`)
)

// Forward job events from the workers to connected browsers. Pub/sub needs
// a dedicated connection.
let stopJobEventSubscriber: (() => Promise<void>) | null = null
startJobEventSubscriber(redis.duplicate())
  .then((stop) => {
    stopJobEventSubscriber = stop
  })
  .catch((error) => {
    logger.error(`Failed to start job event subscriber: ${error}`)
  })

// Cleanup logic
const cleanup = () => {
  logger.info('Closing BilboMD ExpressJS server')
  // server.close() waits for open connections, so end the long-lived event
  // streams first
  closeAllJobEventClients()
  stopJobEventSubscriber?.().catch((error) =>
    logger.error(`Error stopping job event subscriber: ${error}`)
  )
  server.close((err) => {
    logger.info('Closed BilboMD ExpressJS server')
    if (err) {
      logger.error(`Error closing server: ${err}`)
      process.exit(1)
    } else {
      logger.info('Server gracefully shut down.')
      process.exit(0)
    }
  })
}

// Handle process termination signals
process.on('SIGINT', () => {
  logger.info('Received SIGINT ... shutting down BilboMD')
  cleanup()
})

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM ... shutting down BilboMD')
  cleanup()
})
