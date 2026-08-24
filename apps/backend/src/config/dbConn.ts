import mongoose from 'mongoose'
import { logger } from '../middleware/loggers.js'
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

// Retry forever with capped exponential backoff rather than giving up (or
// crashing): a mongod that is briefly unreachable during a deploy or an NFS
// lock-recovery window must not leave the backend permanently wedged, and a
// crash-loop at startup stalls Helm upgrades (see #999 for the Redis
// equivalent). While disconnected, /healthcheck reports 503 so orchestrators
// still see the pod as unhealthy.
const connectDB = async (): Promise<void> => {
  mongoose.set('strictQuery', false)
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(url)
      logger.info('Successfully connected to MongoDB')
      return
    } catch (error) {
      const delay = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS
      )
      logger.error(`MongoDB connection attempt ${attempt} failed: ${error}`)
      logger.info(`Retrying MongoDB connection in ${delay / 1000} seconds...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export { connectDB }
