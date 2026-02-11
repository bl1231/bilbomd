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

const connectDB = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(url)
      logger.info('Successfully connected to MongoDB')
      return
    } catch (err) {
      logger.error(
        `MongoDB connection attempt ${i + 1}/${retries} failed: ${err}`
      )
      if (i === retries - 1) {
        logger.error('All MongoDB connection attempts failed')
        throw err
      }
      logger.info(`Retrying in ${delay / 1000} seconds...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export { connectDB }
