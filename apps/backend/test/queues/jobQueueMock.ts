import { Job as BullMQJob } from 'bullmq'

interface BullMQData {
  type: string
  title: string
  uuid: string
  // Add other properties as needed
}

const mockQueue: BullMQJob[] = []

class MockQueue {
  name: string
  constructor(name: string) {
    this.name = name
  }
  async add(name: string, data: BullMQData) {
    // Simulate adding a job
    const mockJob: BullMQJob = {
      id: `${Date.now()}`,
      name,
      data,
      opts: { attempts: 3 },
      timestamp: Date.now(),
      finishedOn: null,
      processedOn: null,
      progress: 0,
      attemptsMade: 0,
      stacktrace: null,
      returnvalue: null,
      state: 'waiting',
      optsJob: {}
    }
    mockQueue.push(mockJob)
    return mockJob
  }
  async getWaiting() {
    return mockQueue
  }
  // Add other methods as needed
}

const mockQueueJob = async (data: BullMQData) => {
  const queue = new MockQueue('bilbomd')
  const job = await queue.add(data.title, data)
  return job.id
}

const mockGetWaitingJobs = async (): Promise<BullMQJob[]> => {
  return mockQueue
}

export { mockQueueJob, MockQueue as Queue, mockGetWaitingJobs }
