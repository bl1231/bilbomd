import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProgressTracker } from '../progress-tracker.js'
import { Job as BullMQJob } from 'bullmq'
import { IJob } from '@bilbomd/mongodb-schema'

describe('progress-tracker', () => {
  let mockMQJob: Partial<BullMQJob>
  let mockDBJob: Partial<IJob>

  beforeEach(() => {
    mockMQJob = {
      updateProgress: vi.fn().mockResolvedValue(undefined)
    }

    mockDBJob = {
      progress: 0,
      save: vi.fn().mockResolvedValue(undefined)
    }
  })

  it('should update progress in both MQJob and DBJob', async () => {
    const tracker = createProgressTracker(
      mockMQJob as BullMQJob,
      mockDBJob as IJob
    )

    await tracker.update(50)

    expect(mockMQJob.updateProgress).toHaveBeenCalledWith(50)
    expect(mockDBJob.progress).toBe(50)
    expect(mockDBJob.save).toHaveBeenCalled()
  })

  it('should handle multiple progress updates', async () => {
    const tracker = createProgressTracker(
      mockMQJob as BullMQJob,
      mockDBJob as IJob
    )

    await tracker.update(25)
    await tracker.update(50)
    await tracker.update(75)
    await tracker.update(100)

    expect(mockMQJob.updateProgress).toHaveBeenCalledTimes(4)
    expect(mockDBJob.save).toHaveBeenCalledTimes(4)
    expect(mockDBJob.progress).toBe(100)
  })

  it('should propagate errors from MQJob.updateProgress', async () => {
    const error = new Error('MQ update failed')
    mockMQJob.updateProgress = vi.fn().mockRejectedValue(error)

    const tracker = createProgressTracker(
      mockMQJob as BullMQJob,
      mockDBJob as IJob
    )

    await expect(tracker.update(50)).rejects.toThrow('MQ update failed')
  })

  it('should propagate errors from DBJob.save', async () => {
    const error = new Error('DB save failed')
    mockDBJob.save = vi.fn().mockRejectedValue(error)

    const tracker = createProgressTracker(
      mockMQJob as BullMQJob,
      mockDBJob as IJob
    )

    await expect(tracker.update(50)).rejects.toThrow('DB save failed')
  })

  it('should update progress with various percentage values', async () => {
    const tracker = createProgressTracker(
      mockMQJob as BullMQJob,
      mockDBJob as IJob
    )

    const percentages = [0, 10, 25, 50, 75, 90, 100]

    for (const percentage of percentages) {
      await tracker.update(percentage)
      expect(mockDBJob.progress).toBe(percentage)
    }

    expect(mockMQJob.updateProgress).toHaveBeenCalledTimes(percentages.length)
    expect(mockDBJob.save).toHaveBeenCalledTimes(percentages.length)
  })
})
