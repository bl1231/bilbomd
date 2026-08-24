import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('mongoose', () => ({
  default: {
    set: vi.fn(),
    connect: vi.fn()
  }
}))

vi.mock('../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

import { connectDB } from '../dbConn.js'
import mongoose from 'mongoose'
import { logger } from '../../middleware/loggers.js'

const mockConnect = vi.mocked(mongoose.connect)

describe('connectDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connects on the first attempt without retrying', async () => {
    mockConnect.mockResolvedValueOnce(mongoose)

    await connectDB()

    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to MongoDB')
    expect(logger.error).not.toHaveBeenCalled()
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

  it('backs off exponentially between attempts', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(mongoose)

    const promise = connectDB()

    // attempt 1 fails -> 5s delay
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockConnect).toHaveBeenCalledTimes(2)

    // attempt 2 fails -> 10s delay; 5s in, attempt 3 has not started yet
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockConnect).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockConnect).toHaveBeenCalledTimes(3)

    // attempt 3 fails -> 20s delay
    await vi.advanceTimersByTimeAsync(20_000)
    await promise
    expect(mockConnect).toHaveBeenCalledTimes(4)
    expect(logger.info).toHaveBeenCalledWith('Successfully connected to MongoDB')
  })

  it('caps the retry delay at 60 seconds', async () => {
    // 5 failures: delays 5s, 10s, 20s, 40s, then capped at 60s (not 80s)
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
