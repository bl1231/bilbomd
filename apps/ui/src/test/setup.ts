import '@testing-library/jest-dom'
import '@testing-library/jest-dom/vitest'
import '@testing-library/react'
import { afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'

// Polyfill ResizeObserver for Recharts
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Set up globalThis URL base for RTK Query in tests
const originalURL = globalThis.URL
globalThis.URL = class extends originalURL {
  constructor(url: string | URL, base?: string | URL) {
    if (!base && typeof url === 'string' && url.startsWith('/')) {
      // If no base is provided and URL is relative, use our test base
      super(url, 'http://localhost:3002')
    } else {
      super(url, base)
    }
  }
}

// Establish API mocking before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// Reset any request handlers after each test
afterEach(() => {
  server.resetHandlers()
  cleanup()
})

// Clean up after all tests are finished
afterAll(() => server.close())
