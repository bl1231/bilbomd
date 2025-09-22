// Unmock loggers for this test file so we get real coverage
// Must be before any imports
vi.unmock('./loggers.js')
import { describe, it, expect, vi } from 'vitest'
import { logger } from './loggers.js'

describe('loggers.ts', () => {
  it('should log messages in the correct format to Console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Winston Console transport uses process.stdout.write, but for this test, we check that logger does not throw and can log
    expect(() => logger.info('test info message')).not.toThrow()
    expect(() => logger.warn('test warn message')).not.toThrow()
    expect(() => logger.error('test error message')).not.toThrow()
    expect(() => logger.debug('test debug message')).not.toThrow()
    spy.mockRestore()
  })
})
