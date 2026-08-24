import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 👇 Must come BEFORE imports of mongoose or connectDB
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    connection: {}
  }
}))

vi.mock('../loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

import mongoose from 'mongoose'
import { logger } from '../loggers.js'

const mockConnect = vi.mocked(mongoose.connect)

process.env.MONGO_USERNAME = 'testuser'
process.env.MONGO_PASSWORD = 'testpass'
process.env.MONGO_HOSTNAME = 'localhost'
process.env.MONGO_PORT = '27017'
process.env.MONGO_DB = 'testdb'
process.env.MONGO_AUTH_SRC = 'admin'

// 👇 Dynamic import after setting env (the URL is built at module load)
const { connectDB } = await import('../db.js')

describe('connectDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls mongoose.connect with the correct URL', async () => {
    mockConnect.mockResolvedValueOnce(mongoose)

    await connectDB()

    expect(mockConnect).toHaveBeenCalledWith(
      'mongodb://testuser:testpass@localhost:27017/testdb?authSource=admin'
    )
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to MongoDB')
  })

  it('retries after a failed attempt and resolves once connected', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(mongoose)

    const promise = connectDB()
    await vi.advanceTimersByTimeAsync(5_000)
    await promise

    expect(mockConnect).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('MongoDB connection attempt 1 failed')
    )
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to MongoDB')
  })

  it('backs off exponentially and caps the retry delay at 60 seconds', async () => {
    // 6 failures: delays 5s, 10s, 20s, 40s, then capped at 60s (not 80s)
    for (let i = 0; i < 6; i++) {
      mockConnect.mockRejectedValueOnce(new Error('down'))
    }
    mockConnect.mockResolvedValueOnce(mongoose)

    const promise = connectDB()
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 40_000)
    expect(mockConnect).toHaveBeenCalledTimes(5)

    // 5th failure -> capped 60s delay
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockConnect).toHaveBeenCalledTimes(6)

    // 6th failure -> still 60s, never grows beyond the cap
    await vi.advanceTimersByTimeAsync(60_000)
    await promise
    expect(mockConnect).toHaveBeenCalledTimes(7)
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to MongoDB')
  })

  it('never rejects while MongoDB stays down', async () => {
    mockConnect.mockRejectedValue(new Error('down'))

    let settled = false
    const promise = connectDB()
    promise.finally(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(600_000)
    expect(settled).toBe(false)
    expect(mockConnect.mock.calls.length).toBeGreaterThan(5)

    // let it recover so the dangling promise resolves cleanly
    mockConnect.mockResolvedValue(mongoose)
    await vi.advanceTimersByTimeAsync(60_000)
    await promise
    expect(settled).toBe(true)
  })
})
