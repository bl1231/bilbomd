import { describe, it, expect, vi } from 'vitest'

vi.mock('winston-daily-rotate-file', () => ({
  // Must be a real constructor — DailyRotateFile is used with `new`
  default: vi.fn(function DailyRotateFile(this: Record<string, unknown>) {
    this.on = vi.fn()
  })
}))

vi.mock('winston', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
    transports: {
      Console: vi.fn(function Console(this: Record<string, unknown>) {})
    },
    format: {
      combine: vi.fn().mockReturnValue({}),
      timestamp: vi.fn().mockReturnValue({}),
      label: vi.fn().mockReturnValue({}),
      printf: vi.fn().mockReturnValue({}),
      colorize: vi.fn().mockReturnValue({}),
      json: vi.fn().mockReturnValue({})
    }
  }
})

vi.mock('moment-timezone', () => ({
  default: vi.fn().mockReturnValue({
    tz: vi.fn().mockReturnValue({
      format: vi.fn().mockReturnValue('2026-01-01 00:00:00')
    })
  })
}))

import { logger, logsFolder } from '../helpers/loggers.js'

describe('loggers', () => {
  it('exports a logger object', () => {
    expect(logger).toBeDefined()
  })

  it('logger has expected log methods', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
  })

  it('exports logsFolder path', () => {
    expect(logsFolder).toBe('/bilbomd/logs')
  })
})
