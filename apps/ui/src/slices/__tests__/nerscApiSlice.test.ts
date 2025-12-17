import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { nerscApiSlice } from '../nerscApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockNerscStatus = [
  {
    name: 'perlmutter',
    full_name: 'Perlmutter',
    description: 'HPE Cray EX Supercomputer',
    system_type: 'compute' as const,
    notes: ['System operational'],
    status: 'active' as const,
    updated_at: '2023-12-01T10:00:00Z'
  },
  {
    name: 'cfs',
    full_name: 'Community File System',
    description: 'Lustre-based file system',
    system_type: 'filesystem' as const,
    notes: ['Maintenance scheduled'],
    status: 'degraded' as const,
    updated_at: '2023-12-01T09:30:00Z'
  }
]

const mockNerscOutages = [
  {
    name: 'perlmutter',
    start_at: '2023-12-15T08:00:00Z',
    end_at: '2023-12-15T12:00:00Z',
    description: 'Scheduled maintenance',
    notes: 'System will be unavailable',
    status: 'planned',
    swo: 'SWO-2023-001',
    update_at: '2023-12-01T10:00:00Z'
  }
]

const mockProjectHours = {
  cpu_hours_given: 10000,
  cpu_hours_used: 5500,
  gpu_hours_given: 2000,
  gpu_hours_used: 1200
}

describe('nerscApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.get('http://localhost:3003/sfapi/status', () => {
        return HttpResponse.json(mockNerscStatus)
      }),
      http.get('http://localhost:3003/sfapi/outages', () => {
        return HttpResponse.json(mockNerscOutages)
      }),
      http.get(
        'http://localhost:3003/sfapi/account/projects/:projectCode',
        ({ params }) => {
          return HttpResponse.json(mockProjectHours)
        }
      )
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getNerscStatus', () => {
    it('should fetch NERSC system status successfully', async () => {
      const result = await storeRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscStatus.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle empty status response', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/sfapi/status', () => {
          return HttpResponse.json([])
        })
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscStatus.initiate(undefined)
      )

      expect(result.data).toEqual([])
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle server errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/sfapi/status', () => {
          return HttpResponse.json(
            { error: 'Service unavailable' },
            { status: 503 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscStatus.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getNerscOutages', () => {
    it('should fetch NERSC planned outages successfully', async () => {
      const result = await storeRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscOutages.initiate(undefined)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle empty outages response', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/sfapi/outages', () => {
          return HttpResponse.json([])
        })
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscOutages.initiate(undefined)
      )

      expect(result.data).toEqual([])
      expect(result.error).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle network errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get('http://localhost:3003/sfapi/outages', () => {
          return HttpResponse.error()
        })
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getNerscOutages.initiate(undefined)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getProjectHours', () => {
    it('should fetch project hours successfully', async () => {
      const result = await storeRef.store.dispatch(
        nerscApiSlice.endpoints.getProjectHours.initiate('test-repo')
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle invalid repository', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/sfapi/account/projects/:projectCode',
          () => {
            return HttpResponse.json(
              { error: 'Repository not found' },
              { status: 404 }
            )
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getProjectHours.initiate('invalid-repo')
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle unauthorized access', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.get(
          'http://localhost:3003/sfapi/account/projects/:projectCode',
          () => {
            return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        nerscApiSlice.endpoints.getProjectHours.initiate('test-repo')
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })
})
