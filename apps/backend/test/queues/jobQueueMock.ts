import { Job as BullMQJob, Queue } from 'bullmq'

interface BullMQData {
  type: string
  title: string
  uuid: string
  // Add other properties as needed
}

const mockQueue: BullMQJob[] = []

const mockBilbomdQueue = new Queue('bilbomd')

const mockQueueJob = async (data: BullMQData) => {
  try {
    console.log(`${data.type} Job "${data.title}" about to be added to queue`)

    const mockJob: BullMQJob = {
      id: `${Date.now()}`, // Simulating a unique job ID
      name: data.title,
      data,
      opts: {
        attempts: 3
      },
      timestamp: Date.now(),
      finishedOn: null,
      processedOn: null,
      progress: 0,
      attemptsMade: 0,
      stacktrace: null,
      returnvalue: null,
      state: 'waiting', // Job state: 'waiting', 'active', 'completed', 'failed'
      optsJob: {}
    }

    mockQueue.push(mockJob)

    return mockJob.id
  } catch (error) {
    console.error('Error adding job to queue:', error)
    throw error
  }
}

const mockGetWaitingJobs = async (): Promise<BullMQJob[]> => {
  // For simplicity, the mock implementation returns all jobs
  return mockQueue
}

// Implement other mock functions as needed...

export { mockQueueJob, mockBilbomdQueue, mockGetWaitingJobs }
