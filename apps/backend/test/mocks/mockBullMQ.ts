import { vi } from 'vitest'

// Mock BullMQ Queue class
class MockQueue {
  name: string

  constructor(name: string, _options?: any) {
    this.name = name
  }

  async add(_jobName: string, _jobData: any, _options?: any) {
    return {
      id: 'mock-job-id',
      data: _jobData,
      opts: _options
    }
  }

  async getJob(_jobId: string) {
    return null
  }

  async getJobs() {
    return []
  }

  async close() {
    return Promise.resolve()
  }

  on(_event: string, _handler: (...args: any[]) => void) {
    // Do nothing
  }
}

// Mock BullMQ Worker class
class MockWorker {
  constructor(_queueName: string, _processor: any, _options?: any) {
    // Do nothing
  }

  async close() {
    return Promise.resolve()
  }

  on(_event: string, _handler: (...args: any[]) => void) {
    // Do nothing
  }
}

// Mock BullMQ Job class
class MockJob {
  id: string
  data: any

  constructor(id: string, data: any) {
    this.id = id
    this.data = data
  }

  async updateProgress(_progress: number) {
    return Promise.resolve()
  }

  async log(_message: string) {
    return Promise.resolve()
  }
}

vi.mock('bullmq', () => ({
  Queue: MockQueue,
  Worker: MockWorker,
  Job: MockJob
}))

export { MockQueue, MockWorker, MockJob }
