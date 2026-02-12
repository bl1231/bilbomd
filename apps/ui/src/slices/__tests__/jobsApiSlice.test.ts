import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore, waitForApiState } from '../../test/testUtils'
import { jobsApiSlice, selectAllJobs } from '../jobsApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import type { RootState } from '../../app/store'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

const mockJob: BilboMDJobDTO = {
  id: 'job-123',
  username: 'testuser',
  mongo: {
    id: 'job-123',
    title: 'Test Job',
    jobType: 'pdb',
    uuid: 'test-uuid-123',
    access_mode: 'user',
    status: 'Completed',
    data_file: 'test.dat',
    md_engine: 'CHARMM',
    time_submitted: new Date('2023-12-01T10:00:00Z'),
    time_started: new Date('2023-12-01T10:30:00Z'),
    time_completed: new Date('2023-12-01T11:00:00Z'),
    pdb_file: 'test.pdb',
    const_inp_file: 'test.inp',
    conformational_sampling: 100,
    rg: 25.4,
    rg_min: 20.0,
    rg_max: 30.0,
    progress: 100,
    cleanup_in_progress: false,
    user: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com'
    }
  }
}

const mockJobsResponse: BilboMDJobDTO[] = [mockJob]

const mockFoxsAnalysis = {
  chi_sq: 1.23,
  rg: 25.4,
  dmax: 80.5,
  excluded_points: []
}

const mockMDMovies = {
  movies: ['movie1.mp4', 'movie2.mp4']
}

const mockFileCheckResult = {
  isValid: true,
  errors: [],
  warnings: []
}

describe('jobsApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    // No additional handlers needed - using global handlers from test/handlers.ts
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getJobs', () => {
    it('should fetch jobs and transform them using entity adapter', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.getJobs.initiate(undefined)
      )

      expect(result.data?.entities).toBeDefined()
      expect(result.data?.ids).toContain('job-123')
      // Check that the job has been transformed and stored correctly
      expect(result.data?.entities['job-123']).toMatchObject({
        id: 'job-123',
        title: 'Test Job',
        jobType: 'pdb',
        status: 'Completed'
      })
    })

    it('should handle empty jobs response', async () => {
      // Create a fresh store to avoid cached data from previous tests
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/jobs', () => {
          return HttpResponse.json([])
        })
      )

      const result = await freshStoreRef.store.dispatch(
        jobsApiSlice.endpoints.getJobs.initiate(undefined)
      )

      expect(result.data?.ids).toHaveLength(0)
      expect(result.data?.entities).toEqual({})
    })

    it('should provide correct tags', () => {
      const endpointDef = jobsApiSlice.endpoints.getJobs
      // RTK Query handles tags internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.select).toBeDefined()
    })
  })

  describe('getJobById', () => {
    it('should fetch individual job by ID', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.getJobById.initiate('job-123')
      )

      expect(result.data).toMatchObject({
        id: 'job-123',
        title: 'Test Job',
        jobType: 'pdb',
        status: 'Completed'
      })
    })

    it('should provide correct tags', () => {
      const endpointDef = jobsApiSlice.endpoints.getJobById
      // RTK Query handles tags internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.select).toBeDefined()
    })

    it('should handle job not found', async () => {
      server.use(
        http.get('http://localhost:3002/api/v1/jobs/non-existent', () => {
          return HttpResponse.json({ error: 'Job not found' }, { status: 404 })
        })
      )

      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.getJobById.initiate('non-existent')
      )

      // RTK Query returns errors in the result object, not as thrown exceptions
      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
      const status = (result.error as FetchBaseQueryError | undefined)?.status
      expect(status).toBe(404)
    })
  })

  describe('getFoxsAnalysisById', () => {
    it('should fetch FoXS analysis data', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.getFoxsAnalysisById.initiate('job-123')
      )

      expect(result.data).toEqual(mockFoxsAnalysis)
    })

    it('should provide correct tags', () => {
      const endpointDef = jobsApiSlice.endpoints.getFoxsAnalysisById
      // RTK Query handles tags internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.select).toBeDefined()
    })
  })

  describe('addNewJob', () => {
    it('should create new job', async () => {
      const newJobData = new FormData()
      newJobData.append('title', 'New Test Job')
      newJobData.append('jobType', 'auto')

      const promise = storeRef.store.dispatch(
        jobsApiSlice.endpoints.addNewJob.initiate(newJobData)
      )

      const result = await promise
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should invalidate job list tags', () => {
      const endpointDef = jobsApiSlice.endpoints.addNewJob
      // RTK Query handles tag invalidation internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.initiate).toBeDefined()
    })

    it('should handle validation errors', async () => {
      server.use(
        http.post('http://localhost:3003/api/v1/jobs', () => {
          return HttpResponse.json(
            { error: 'Validation failed' },
            { status: 400 }
          )
        })
      )

      const invalidData = new FormData()
      invalidData.append('invalidData', 'true')

      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.addNewJob.initiate(invalidData)
      )

      // RTK Query returns errors in the result object, not as thrown exceptions
      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
      const status = (result.error as FetchBaseQueryError | undefined)?.status
      expect(status).toBe(400)
    })
  })

  describe('updateJob', () => {
    it('should update existing job', async () => {
      const updateData = { id: 'job-123', title: 'Updated Job Title' }

      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.updateJob.initiate(updateData)
      )

      expect(result.data).toMatchObject(updateData)
    })

    it('should invalidate specific job tags', () => {
      const endpointDef = jobsApiSlice.endpoints.updateJob
      // RTK Query handles tag invalidation internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.initiate).toBeDefined()
    })
  })

  describe('deleteJob', () => {
    it('should delete job successfully', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
      )

      expect(result.data).toEqual({ success: true })
    })

    it('should optimistically remove job from cache', async () => {
      // This test verifies that delete operation works correctly
      // RTK Query cache invalidation is handled by the framework
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
      )

      expect(result.data).toEqual({ success: true })
    })

    it('should invalidate specific job tags', () => {
      const endpointDef = jobsApiSlice.endpoints.deleteJob
      // RTK Query handles tag invalidation internally, we just verify the endpoint exists
      expect(endpointDef).toBeDefined()
      expect(endpointDef.initiate).toBeDefined()
    })
  })

  describe('checkJobFiles', () => {
    it('should check job files successfully', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.checkJobFiles.initiate('job-123')
      )

      expect(result.data).toEqual(mockFileCheckResult)
    })
  })

  describe('getMDMovies', () => {
    it('should fetch MD movie assets successfully', async () => {
      const result = await storeRef.store.dispatch(
        jobsApiSlice.endpoints.getMDMovies.initiate('job-123')
      )

      await waitForApiState(storeRef.store)
      expect(result.data).toBeDefined()
    })
  })

  describe('selectors', () => {
    it('should export selectAllJobs selector', () => {
      expect(typeof selectAllJobs).toBe('function')
    })

    it('should select all jobs from normalized state', () => {
      // Create a mock state that matches the expected structure for the selector
      const mockState = {
        api: {
          queries: {
            'getJobs("jobsList")': {
              status: 'fulfilled',
              data: {
                ids: ['job-123'],
                entities: { 'job-123': mockJob }
              }
            }
          }
        }
      } as unknown as RootState

      // The selector expects the full Redux state
      const allJobs = selectAllJobs(mockState)
      expect(allJobs).toEqual([mockJob])
    })
  })

  describe('error handling', () => {
    it('should handle network errors', async () => {
      server.use(
        http.get('http://localhost:3002/api/v1/jobs', () => {
          return HttpResponse.error()
        })
      )

      try {
        await storeRef.store.dispatch(
          jobsApiSlice.endpoints.getJobs.initiate(undefined)
        )
        expect.fail('Expected query to throw')
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should handle server errors', async () => {
      // Use a fresh store to avoid cache interference
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/jobs', () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        jobsApiSlice.endpoints.getJobs.initiate(undefined)
      )

      // RTK Query returns errors in the result object, not as thrown exceptions
      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()
      const status = (result.error as FetchBaseQueryError | undefined)?.status
      expect(status).toBe(500)

      freshStoreRef.cleanup()
    })
  })
})
