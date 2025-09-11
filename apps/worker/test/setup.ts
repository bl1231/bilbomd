import { vi } from 'vitest'

vi.mock('../src/helpers/loggers', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))
