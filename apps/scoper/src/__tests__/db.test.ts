import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockConnect } = vi.hoisted(() => ({ mockConnect: vi.fn() }))

vi.mock('mongoose', () => ({ default: { connect: mockConnect } }))

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { connectDB } from '../helpers/db.js'
import { logger } from '../helpers/loggers.js'

beforeEach(() => vi.clearAllMocks())

describe('connectDB', () => {
  it('connects to MongoDB with the constructed URL', async () => {
    mockConnect.mockResolvedValue(undefined)
    await connectDB()
    expect(mockConnect).toHaveBeenCalledOnce()
    expect(mockConnect).toHaveBeenCalledWith(expect.stringContaining('mongodb://'))
  })

  it('logs an error when mongoose.connect throws', async () => {
    mockConnect.mockRejectedValue(new Error('connection refused'))
    await connectDB()
    expect(logger.error).toHaveBeenCalledWith('Error connecting to MongoDB')
  })

  it('does not rethrow on connection failure', async () => {
    mockConnect.mockRejectedValue(new Error('timeout'))
    await expect(connectDB()).resolves.toBeUndefined()
  })
})
