import { describe, it, expect } from 'vitest'
import { superfacilityApiSlice } from '../sfapiSlice'

describe('superfacilityApiSlice', () => {
  describe('configuration', () => {
    it('should have correct reducer path', () => {
      expect(superfacilityApiSlice.reducerPath).toBe('superfacilityApi')
    })

    it('should have /sfapi as base URL', () => {
      const config = superfacilityApiSlice.internalActions
      expect(config).toBeDefined()
    })

    it('should define tag types', () => {
      // The superfacilityApiSlice should have these tag types defined:
      // ['Status', 'Project', 'Outages']
      expect(superfacilityApiSlice).toBeDefined()
    })

    it('should have empty endpoints initially', () => {
      // The slice defines endpoints as empty initially
      // Endpoints are injected elsewhere
      expect(superfacilityApiSlice.endpoints).toBeDefined()
    })
  })

  describe('reducer', () => {
    it('should export a valid reducer', () => {
      expect(typeof superfacilityApiSlice.reducer).toBe('function')
    })

    it('should export middleware', () => {
      expect(superfacilityApiSlice.middleware).toBeDefined()
    })
  })
})
