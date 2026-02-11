import { vi, Mock } from 'vitest'

// Mock mongoose.connect
// 👇 Must come BEFORE imports of mongoose or connectDB
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    connection: {}
  }
}))
import { describe, it, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'

describe('connectDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls mongoose.connect with the correct URL', async () => {
    process.env.MONGO_USERNAME = 'testuser'
    process.env.MONGO_PASSWORD = 'testpass'
    process.env.MONGO_HOSTNAME = 'localhost'
    process.env.MONGO_PORT = '27017'
    process.env.MONGO_DB = 'testdb'
    process.env.MONGO_AUTH_SRC = 'admin'

    const expectedUrl = 'mongodb://testuser:testpass@localhost:27017/testdb?authSource=admin'

    // 👇 Dynamic import after setting env
    const { connectDB } = await import('../db.js')

    await connectDB()
    expect(mongoose.connect).toHaveBeenCalledWith(expectedUrl)
  })

  it('retries connection and throws after all attempts fail', async () => {
    ;(mongoose.connect as unknown as Mock).mockImplementation(() => {
      throw new Error('connection failed')
    })
    // 👇 Dynamic import after setting env
    const { connectDB } = await import('../db.js')

    // Should throw after all retries fail
    await expect(connectDB(3, 100)).rejects.toThrow('connection failed')

    // Should have attempted 3 times
    expect(mongoose.connect).toHaveBeenCalledTimes(3)
  })
})
