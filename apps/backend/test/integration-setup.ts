import dotenv from 'dotenv'
dotenv.config({ path: './.env.test.compose' })

console.log('*** Integration test setup loaded ***')

import { beforeAll, afterAll, afterEach } from 'vitest'
import { connectTestDB, disconnectTestDB } from './db-helper.js'
import mongoose from 'mongoose'
import { User, Job } from '@bilbomd/mongodb-schema'
import './mocks/mockRedis.js'
import './mocks/mockBullMQ.js'

// Global setup for all integration tests
beforeAll(async () => {
  await connectTestDB()

  // Initialize collections by ensuring models are loaded and collections exist
  try {
    // Create a temp document to initialize the collection, then delete it
    const tempUser = await User.create({
      username: 'temp-init-user',
      email: 'temp@init.com',
      roles: ['User']
    })
    await User.deleteOne({ _id: tempUser._id })
  } catch (error) {
    console.log('User collection initialization:', error.message)
  }
}, 15000)

// Clear collections before each test to ensure isolation
afterEach(async () => {
  // Clear collections after each test to avoid interfering with test-specific setup
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections()
    const userCollections = collections.filter(
      (c) =>
        !c.collectionName.startsWith('system.') &&
        !['admin', 'config', 'local'].includes(c.collectionName)
    )
    if (userCollections.length > 0) {
      await Promise.all(userCollections.map((c) => c.deleteMany({})))
    }
  }
})

afterAll(async () => {
  await disconnectTestDB()
}, 15000)
