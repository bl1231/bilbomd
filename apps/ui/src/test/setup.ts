import '@testing-library/jest-dom'
import '@testing-library/jest-dom/vitest'
import '@testing-library/react'
import { afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'

// Node.js v26 defines localStorage/sessionStorage as getter-only globals that
// return undefined without --localstorage-file, shadowing jsdom's implementation.
// Use defineProperty to force-override with jsdom's working versions.
Object.defineProperty(globalThis, 'localStorage', {
  value: window.localStorage,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: window.sessionStorage,
  configurable: true,
  writable: true,
})

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
      super(url, 'http://localhost:3003')
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
