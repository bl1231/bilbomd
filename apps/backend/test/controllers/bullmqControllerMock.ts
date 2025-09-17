// bullmqControllerMock.ts

const mockGetActiveCount = jest.fn().mockResolvedValue(42) // Example value
const mockGetWaitingCount = jest.fn().mockResolvedValue(13) // Example value
const mockGetWorkers = jest.fn().mockResolvedValue([]) // Example value

const getQueueStatus = async () => {
  const bullmqActiveCount = await mockGetActiveCount()
  const bullmqWaitCount = await mockGetWaitingCount()
  const bullmqWorkerCount = (await mockGetWorkers()).length
  const queueStatus = {
    name: 'bilbomd',
    active_count: bullmqActiveCount,
    waiting_count: bullmqWaitCount,
    worker_count: bullmqWorkerCount
  }
  return queueStatus
}

export { getQueueStatus, mockGetActiveCount, mockGetWaitingCount, mockGetWorkers }
