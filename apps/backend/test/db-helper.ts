import mongoose from 'mongoose'

const connectTestDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_TEST_URI
  if (!mongoUri) {
    throw new Error(
      'MONGODB_TEST_URI is not set. For Compose-backed tests, create apps/backend/.env.test.compose with MONGODB_TEST_URI, or export it before running.'
    )
  }

  // Ensure clean state
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000
  })

  console.log(`*** Connected to test database: ${mongoUri} ***`)
}

const disconnectTestDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    // Drop the test database completely
    await mongoose.connection.dropDatabase()
    await mongoose.connection.close()
  }
  console.log('*** Test database disconnected and dropped ***')
}

export { connectTestDB, disconnectTestDB }
