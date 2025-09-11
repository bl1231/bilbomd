import app from './app.js'
import { logger } from './middleware/loggers.js'

const PORT = 3500

const server = app.listen(PORT, () =>
  logger.info(`BilboMD server starting on port ${PORT}`)
)

// Cleanup logic
const cleanup = () => {
  logger.info('Closing BilboMD ExpressJS server')
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
