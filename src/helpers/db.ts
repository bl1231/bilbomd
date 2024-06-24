import { logger } from './loggers'
import mongoose from 'mongoose'

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
  // console.log(url)
  try {
    await mongoose.connect(url)
  } catch (err) {
    logger.error('Error connecting to MongoDB')
    console.error(err)
  }
}

export { connectDB }
