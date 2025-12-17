import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { publicJobsApiSlice } from '../publicJobsApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'
import type { PublicJobStatus, AnonJobResponse } from '@bilbomd/bilbomd-types'
import type { IFeedbackData } from '@bilbomd/mongodb-schema/frontend'
import type { FoxsData } from '../../types/foxs'

const mockAnonJobResponse: AnonJobResponse = {
  message: 'Job submitted successfully',
  jobid: 'job-123',
  uuid: 'uuid-123',
  md_engine: 'CHARMM',
  publicId: 'pub-123'
}

const mockPublicJobStatus: PublicJobStatus = {
  publicId: 'pub-123',
  jobId: 'job-123',
  uuid: 'uuid-123',
  jobType: 'pdb',
  status: 'Completed',
  progress: 100,
  md_engine: 'CHARMM',
  submittedAt: new Date('2023-12-01T09:00:00Z'),
  startedAt: new Date('2023-12-01T10:00:00Z'),
  completedAt: new Date('2023-12-01T11:00:00Z')
}

const mockFoxsData: FoxsData[] = [
  {
    filename: 'structure_001.pdb',
    chisq: 1.23,
    c1: '1.0',
    c2: '0.0',
    data: []
  }
]

const mockFeedbackData: IFeedbackData = {
  mw_saxs: 25.4,
  mw_model: 24.8,
  mw_err: 0.6,
  best_model_dat_file: 'best_model.dat',
  best_ensemble_pdb_file: 'ensemble.pdb',
  overall_chi_square: 1.23,
  q_ranges: [0.1, 0.5],
  chi_squares_of_regions: [1.1, 1.3],
  residuals_of_regions: [0.1, 0.2],
  mw_feedback: 'Good MW agreement',
  overall_chi_square_feedback: 'Excellent fit',
  highest_chi_square_feedback: 'Good',
  second_highest_chi_square_feedback: 'Acceptable',
  regional_chi_square_feedback: 'Good regional fit',
  timestamp: new Date('2023-12-01T12:00:00Z')
}

const mockEnsemblePdbFiles = {
  ensemblePdbFiles: ['structure_001.pdb', 'structure_002.pdb']
}

const mockTextFile = 'This is sample text file content'

describe('publicJobsApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.post(
        'http://localhost:3003/api/v1/public/jobs',
        async ({ request }) => {
          const formData = await request.formData()
          return HttpResponse.json(mockAnonJobResponse)
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/public/jobs/sans',
        async ({ request }) => {
          const formData = await request.formData()
          return HttpResponse.json(mockAnonJobResponse)
        }
      ),
      http.get(
        'http://localhost:3003/api/v1/public/jobs/:publicId',
        ({ params }) => {
          return HttpResponse.json(mockPublicJobStatus)
        }
      ),
      http.get(
        'http://localhost:3003/api/v1/public/jobs/:publicId/results/foxs',
        () => {
          return HttpResponse.json(mockFoxsData)
        }
      ),
      http.get(
        'http://localhost:3003/api/v1/public/jobs/:publicId/results/feedback',
        () => {
          return HttpResponse.json(mockFeedbackData)
        }
      ),
      http.get(
        'http://localhost:3003/api/v1/public/jobs/:publicId/results/:filename',
        ({ params }) => {
          const { filename } = params
          if (filename === 'ensemble.json') {
            return HttpResponse.json(mockEnsemblePdbFiles)
          } else if (filename === 'output.txt') {
            return HttpResponse.text(mockTextFile)
          } else {
            // Default blob response
            return new Response(new ArrayBuffer(8), {
              headers: {
                'Content-Type': 'application/octet-stream'
              }
            })
          }
        }
      )
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('addNewPublicJob', () => {
    it('should submit new public job with FormData', async () => {
      const formData = new FormData()
      formData.append('title', 'Test Public Job')
      formData.append('pdb_file', new File(['pdb content'], 'test.pdb'))

      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.addNewPublicJob.initiate(formData)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle submission errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/public/jobs', () => {
          return HttpResponse.json(
            { error: 'Validation failed' },
            { status: 400 }
          )
        })
      )

      const formData = new FormData()
      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.addNewPublicJob.initiate(formData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('addNewPublicSANSJob', () => {
    it('should submit new SANS job with FormData', async () => {
      const formData = new FormData()
      formData.append('title', 'Test SANS Job')
      formData.append('dat_file', new File(['dat content'], 'test.dat'))

      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.addNewPublicSANSJob.initiate(formData)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle SANS job submission errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/public/jobs/sans', () => {
          return HttpResponse.json({ error: 'File too large' }, { status: 413 })
        })
      )

      const formData = new FormData()
      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.addNewPublicSANSJob.initiate(formData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicJobById', () => {
    it('should fetch public job status by ID', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicJobById.initiate('pub-123')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle job not found', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/api/v1/public/jobs/:id', () => {
          return HttpResponse.json({ error: 'Job not found' }, { status: 404 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicJobById.initiate('nonexistent')
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicFoxsData', () => {
    it('should fetch FoXS data for public job', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicFoxsData.initiate('pub-123')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle no FoXS data available', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/api/v1/public/jobs/:publicId/results/foxs',
          () => {
            return HttpResponse.json([])
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicFoxsData.initiate('pub-123')
      )

      expect(result.data).toEqual([])
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicFeedbackData', () => {
    it('should fetch feedback data for public job', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicFeedbackData.initiate('pub-123')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle no feedback available', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/api/v1/public/jobs/:publicId/results/feedback',
          () => {
            return HttpResponse.json(
              { error: 'No feedback found' },
              { status: 404 }
            )
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicFeedbackData.initiate('pub-123')
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicResultFile', () => {
    it('should fetch result file as Blob', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFile.initiate({
          publicId: 'pub-123',
          filename: 'output.pdb'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle file not found', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/api/v1/public/jobs/:publicId/results/:filename',
          () => {
            return HttpResponse.json(
              { error: 'File not found' },
              { status: 404 }
            )
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFile.initiate({
          publicId: 'pub-123',
          filename: 'nonexistent.pdb'
        })
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicResultFileJson', () => {
    it('should fetch result file as JSON', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFileJson.initiate({
          publicId: 'pub-123',
          filename: 'ensemble.json'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle invalid JSON', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/api/v1/public/jobs/:publicId/results/:filename',
          () => {
            return HttpResponse.text('invalid json')
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFileJson.initiate({
          publicId: 'pub-123',
          filename: 'invalid.json'
        })
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPublicResultFileText', () => {
    it('should fetch result file as text', async () => {
      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFileText.initiate({
          publicId: 'pub-123',
          filename: 'output.txt'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle binary file as text', async () => {
      server.use(
        http.get(
          'http://localhost:3003/api/v1/public/jobs/:publicId/results/:filename',
          () => {
            return HttpResponse.arrayBuffer(new ArrayBuffer(8))
          }
        )
      )

      const result = await storeRef.store.dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFileText.initiate({
          publicId: 'pub-123',
          filename: 'binary.dat'
        })
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })
})
