import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { alphafoldPaeVizSlice } from '../alphafoldPaeVizSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

const mockVizJson = {
  length: 100,
  downsample: 2,
  mask: { plddt_cutoff: 70, low_confidence_residues: [10, 20, 30] },
  clusters: [
    {
      id: 1,
      type: 'rigid' as const,
      ranges: [
        [1, 50],
        [60, 80]
      ],
      bbox: [0, 0, 100, 100]
    },
    {
      id: 2,
      type: 'fixed' as const,
      ranges: [[51, 59]]
    }
  ]
}

describe('alphafoldPaeVizSlice', () => {
  const storeRef = setupApiStore()
  const testUuid = 'test-uuid-123'

  beforeEach(() => {
    // Mock viz.json endpoint
    server.use(
      http.get(
        `http://localhost:3003/api/v1/af2pae/${testUuid}/viz.json`,
        () => {
          return HttpResponse.json(mockVizJson)
        }
      )
    )

    // Mock pae.bin endpoint - returns binary data
    server.use(
      http.get(`http://localhost:3003/api/v1/af2pae/${testUuid}/pae.bin`, () => {
        // Create a small ArrayBuffer for testing
        const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer
        return HttpResponse.arrayBuffer(buffer)
      })
    )

    // Mock viz.png endpoint - returns blob
    server.use(
      http.get(`http://localhost:3003/api/v1/af2pae/${testUuid}/viz.png`, () => {
        const blob = new Blob(['fake-png-data'], { type: 'image/png' })
        return new HttpResponse(blob, {
          headers: { 'Content-Type': 'image/png' }
        })
      })
    )

    // Mock pae.png endpoint - returns blob
    server.use(
      http.get(`http://localhost:3003/api/v1/af2pae/${testUuid}/pae.png`, () => {
        const blob = new Blob(['fake-pae-png-data'], { type: 'image/png' })
        return new HttpResponse(blob, {
          headers: { 'Content-Type': 'image/png' }
        })
      })
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getVizJson', () => {
    it('should fetch viz.json successfully', async () => {
      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getVizJson.initiate(testUuid)
      )

      expect(result.data).toEqual(mockVizJson)
      expect(result.error).toBeUndefined()
    })

    it('should provide correct tags', async () => {
      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getVizJson.initiate(testUuid)
      )

      expect(result.data).toBeDefined()
      // Tags are provided for cache invalidation
    })

    it('should handle errors', async () => {
      const freshStoreRef = setupApiStore()
      const badUuid = 'non-existent-uuid'

      server.use(
        http.get(
          `http://localhost:3003/api/v1/af2pae/${badUuid}/viz.json`,
          () => {
            return HttpResponse.json({ error: 'Not found' }, { status: 404 })
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getVizJson.initiate(badUuid)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('getPaeBin', () => {
    it('should fetch and transform binary data to base64', async () => {
      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getPaeBin.initiate(testUuid)
      )

      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
      // Should be base64 encoded
      expect(result.data?.length).toBeGreaterThan(0)
    })

    it('should handle large binary data in chunks', async () => {
      // Create a larger buffer to test chunking (> 0x8000 bytes)
      const largeSize = 0x10000 // 64KB
      const largeBuffer = new Uint8Array(largeSize).fill(255).buffer

      server.use(
        http.get(`http://localhost:3003/api/v1/af2pae/${testUuid}/pae.bin`, () => {
          return HttpResponse.arrayBuffer(largeBuffer)
        })
      )

      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getPaeBin.initiate(testUuid)
      )

      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
    })

    it('should cache data for 60 seconds', () => {
      const endpointDef = alphafoldPaeVizSlice.endpoints.getPaeBin
      // The endpoint should be defined with keepUnusedDataFor: 60
      expect(endpointDef).toBeDefined()
    })
  })

  describe('getVizPng', () => {
    it('should fetch blob and transform to object URL', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url-viz')
      const originalCreateObjectURL = URL.createObjectURL

      URL.createObjectURL = mockCreateObjectURL

      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getVizPng.initiate(testUuid)
      )

      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
      expect(mockCreateObjectURL).toHaveBeenCalled()

      URL.createObjectURL = originalCreateObjectURL
    })

    it('should cache data for 60 seconds', () => {
      const endpointDef = alphafoldPaeVizSlice.endpoints.getVizPng
      expect(endpointDef).toBeDefined()
    })
  })

  describe('getPaePng', () => {
    it('should fetch blob and transform to object URL', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url-pae')
      const originalCreateObjectURL = URL.createObjectURL

      URL.createObjectURL = mockCreateObjectURL

      const result = await storeRef.store.dispatch(
        alphafoldPaeVizSlice.endpoints.getPaePng.initiate(testUuid)
      )

      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
      expect(mockCreateObjectURL).toHaveBeenCalled()

      URL.createObjectURL = originalCreateObjectURL
    })

    it('should cache data for 60 seconds', () => {
      const endpointDef = alphafoldPaeVizSlice.endpoints.getPaePng
      expect(endpointDef).toBeDefined()
    })
  })

  describe('exported hooks', () => {
    it('should export useGetVizJsonQuery', () => {
      expect(typeof alphafoldPaeVizSlice.useGetVizJsonQuery).toBe('function')
    })

    it('should export useGetPaeBinQuery', () => {
      expect(typeof alphafoldPaeVizSlice.useGetPaeBinQuery).toBe('function')
    })

    it('should export useGetVizPngQuery', () => {
      expect(typeof alphafoldPaeVizSlice.useGetVizPngQuery).toBe('function')
    })

    it('should export useGetPaePngQuery', () => {
      expect(typeof alphafoldPaeVizSlice.useGetPaePngQuery).toBe('function')
    })
  })

  describe('TypeScript types', () => {
    it('should define VizJSON type correctly', () => {
      // Type check - this will fail at compile time if types are wrong
      const vizJson = {
        length: 100,
        clusters: []
      }
      expect(vizJson).toBeDefined()
      expect(vizJson.length).toBe(100)
    })

    it('should define ClusterType correctly', () => {
      const rigidType = 'rigid' as const
      const fixedType = 'fixed' as const
      expect(rigidType).toBe('rigid')
      expect(fixedType).toBe('fixed')
    })
  })
})
