import mongoose from 'mongoose'

const connectTestDB = async (): Promise<void> => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/bilbomd-test'

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
