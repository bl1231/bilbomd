import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { adminApiSlice } from '../adminApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockQueuesResponse = [
  {
    name: 'test-queue',
    waiting: 5,
    active: 2,
    completed: 100,
    failed: 3,
    paused: false
  }
]

const mockJobsByQueueResponse = [
  {
    id: 'job-1',
    name: 'test-job-1',
    data: { test: 'data' },
    opts: {},
    progress: 50,
    delay: 0,
    timestamp: 1640995200000,
    attemptsMade: 1,
    failedReason: null,
    stacktrace: null,
    returnvalue: null,
    finishedOn: null,
    processedOn: null
  }
]

describe('adminApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('http://localhost:3003/api/v1/admin/queues', () => {
        return HttpResponse.json(mockQueuesResponse)
      }),
      http.post(
        'http://localhost:3003/api/v1/admin/queues/:queueName/pause',
        () => {
          return HttpResponse.json({ success: true })
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/admin/queues/:queueName/resume',
        () => {
          return HttpResponse.json({ success: true })
        }
      ),
      http.get(
        'http://localhost:3003/api/v1/admin/queues/:queueName/jobs',
        () => {
          return HttpResponse.json(mockJobsByQueueResponse)
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/admin/queues/:queueName/jobs/:jobId/retry',
        () => {
          return HttpResponse.json({ success: true })
        }
      ),
      http.delete(
        'http://localhost:3003/api/v1/admin/queues/:queueName/jobs/:jobId',
        () => {
          return HttpResponse.json({ success: true })
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/admin/queues/:queueName/drain',
        () => {
          return HttpResponse.json({ success: true })
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/admin/queues/:queueName/jobs/:jobId/fail',
        () => {
          return HttpResponse.json({ success: true })
        }
      )
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getQueues', () => {
    it('should fetch queues successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.getQueues.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('pauseQueue', () => {
    it('should pause a queue successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.pauseQueue.initiate('test-queue')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('resumeQueue', () => {
    it('should resume a queue successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.resumeQueue.initiate('test-queue')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('getJobsByQueue', () => {
    it('should fetch jobs by queue successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.getJobsByQueue.initiate('test-queue')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('retryQueueJob', () => {
    it('should retry a queue job successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.retryQueueJob.initiate({
          queueName: 'test-queue',
          jobId: 'job-1'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('deleteQueueJob', () => {
    it('should delete a queue job successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.deleteQueueJob.initiate({
          queueName: 'test-queue',
          jobId: 'job-1'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('drainQueue', () => {
    it('should drain a queue successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.drainQueue.initiate('test-queue')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })

  describe('failQueueJob', () => {
    it('should fail a queue job successfully', async () => {
      const result = await storeRef.store.dispatch(
        adminApiSlice.endpoints.failQueueJob.initiate({
          queueName: 'test-queue',
          jobId: 'job-1'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })
})
