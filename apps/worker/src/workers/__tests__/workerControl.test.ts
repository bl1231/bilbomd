import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pauseProcessing, resumeProcessing, checkNERSC } from '../workerControl.js'
import { Worker } from 'bullmq'
import { logger } from '../../helpers/loggers.js'
import { ensureValidToken } from '../../services/functions/nersc-api-token-functions.js'

vi.mock('../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('../../services/functions/nersc-api-token-functions.js', () => ({
  ensureValidToken: vi.fn()
}))

describe('workerControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('pauseProcessing', () => {
    it('should pause all workers', async () => {
      const mockWorker1 = {
        pause: vi.fn().mockResolvedValue(undefined)
      } as unknown as Worker

      const mockWorker2 = {
        pause: vi.fn().mockResolvedValue(undefined)
      } as unknown as Worker

      const workers = [
        { worker: mockWorker1, name: 'BilboMD Worker' },
        { worker: mockWorker2, name: 'Movie Worker' }
      ]

      await pauseProcessing(workers)

      expect(mockWorker1.pause).toHaveBeenCalledTimes(1)
      expect(mockWorker2.pause).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith('BilboMD Worker paused due to invalid NERSC tokens')
      expect(logger.info).toHaveBeenCalledWith('Movie Worker paused due to invalid NERSC tokens')
    })

    it('should handle empty workers array', async () => {
      const workers: { worker: Worker; name: string }[] = []

      await pauseProcessing(workers)

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('should skip null workers', async () => {
      const workers = [
        { worker: null as unknown as Worker, name: 'Null Worker' }
      ]

      await pauseProcessing(workers)

      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('resumeProcessing', () => {
    it('should resume all workers', async () => {
      const mockWorker1 = {
        resume: vi.fn().mockResolvedValue(undefined)
      } as unknown as Worker

      const mockWorker2 = {
        resume: vi.fn().mockResolvedValue(undefined)
      } as unknown as Worker

      const workers = [
        { worker: mockWorker1, name: 'BilboMD Worker' },
        { worker: mockWorker2, name: 'Movie Worker' }
      ]

      await resumeProcessing(workers)

      expect(mockWorker1.resume).toHaveBeenCalledTimes(1)
      expect(mockWorker2.resume).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith('BilboMD Worker resumed')
      expect(logger.info).toHaveBeenCalledWith('Movie Worker resumed')
    })

    it('should handle empty workers array', async () => {
      const workers: { worker: Worker; name: string }[] = []

      await resumeProcessing(workers)

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('should skip null workers', async () => {
      const workers = [
        { worker: null as unknown as Worker, name: 'Null Worker' }
      ]

      await resumeProcessing(workers)

      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('checkNERSC', () => {
    it('should return true when valid token is obtained', async () => {
      const mockToken = 'valid-token-1234567890'
      vi.mocked(ensureValidToken).mockResolvedValue(mockToken)

      const result = await checkNERSC()

      expect(result).toBe(true)
      expect(ensureValidToken).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully obtained NERSC token: ${mockToken.slice(0, 10)}...`
      )
    })

    it('should return false when token is too short', async () => {
      const mockToken = 'short'
      vi.mocked(ensureValidToken).mockResolvedValue(mockToken)

      const result = await checkNERSC()

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        `Did not successfully obtain NERSC token: ${mockToken}`
      )
    })

    it('should return false when token is empty string', async () => {
      const mockToken = ''
      vi.mocked(ensureValidToken).mockResolvedValue(mockToken)

      const result = await checkNERSC()

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        `Did not successfully obtain NERSC token: ${mockToken}`
      )
    })

    it('should return false and log error when ensureValidToken throws', async () => {
      const error = new Error('Token service unavailable')
      vi.mocked(ensureValidToken).mockRejectedValue(error)

      const result = await checkNERSC()

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to obtain NERSC token: ${error}`
      )
    })

    it('should return false when ensureValidToken throws non-Error', async () => {
      const error = 'String error'
      vi.mocked(ensureValidToken).mockRejectedValue(error)

      const result = await checkNERSC()

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to obtain NERSC token: ${error}`
      )
    })

    it('should handle token of exactly 10 characters', async () => {
      const mockToken = '1234567890'
      vi.mocked(ensureValidToken).mockResolvedValue(mockToken)

      const result = await checkNERSC()

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith(
        `Did not successfully obtain NERSC token: ${mockToken}`
      )
    })

    it('should handle token of 11 characters (valid)', async () => {
      const mockToken = '12345678901'
      vi.mocked(ensureValidToken).mockResolvedValue(mockToken)

      const result = await checkNERSC()

      expect(result).toBe(true)
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully obtained NERSC token: ${mockToken.slice(0, 10)}...`
      )
    })
  })
})
