import '@testing-library/jest-dom'
import '@testing-library/jest-dom/vitest'
import '@testing-library/react'
import { afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server'

// Node.js v26 defines localStorage/sessionStorage with a getter that returns
// undefined without --localstorage-file. In the jsdom fork environment
// window.localStorage resolves through the same getter (window === globalThis),
// so we must provide an explicit in-memory implementation.
const makeStorageMock = (): Storage => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage
}

Object.defineProperty(globalThis, 'localStorage', {
  value: makeStorageMock(),
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: makeStorageMock(),
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
