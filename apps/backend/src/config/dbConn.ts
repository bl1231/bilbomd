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

const connectDB = async () => {
  // logger.info(`MongoDB URL: ${url}`)
  try {
    mongoose.set('strictQuery', false)
    await mongoose.connect(url)
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error}`)
  }
}

export { connectDB }
