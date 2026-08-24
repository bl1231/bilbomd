import mongoose from 'mongoose'
import { logger } from './loggers.js'

const {
  MONGO_USERNAME,
  MONGO_PASSWORD,
  MONGO_HOSTNAME,
  MONGO_PORT,
  MONGO_DB,
  MONGO_AUTH_SRC
} = process.env

const url = `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOSTNAME}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_SRC}`

const INITIAL_RETRY_DELAY_MS = 5_000
const MAX_RETRY_DELAY_MS = 60_000

// Retry forever with capped exponential backoff rather than giving up after a
// fixed number of attempts: a mongod that is briefly unreachable during a
// deploy or an NFS lock-recovery window can outlast a finite retry budget, and
// connectDB() is called fire-and-forget, so a throw here becomes an unhandled
// rejection that kills the worker. Mirrors the backend's dbConn.ts.
const connectDB = async (): Promise<void> => {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(url)
      logger.info('Successfully connected to MongoDB')
      return
    } catch (err) {
      const delay = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS
      )
      logger.error(`MongoDB connection attempt ${attempt} failed: ${err}`)
      logger.info(`Retrying MongoDB connection in ${delay / 1000} seconds...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export { connectDB }
