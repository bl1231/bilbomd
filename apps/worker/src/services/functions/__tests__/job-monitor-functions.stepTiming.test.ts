import { describe, it, expect, vi } from 'vitest'
import { stepTiming } from '../job-monitor-functions.js'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../nersc-api-functions.js', () => ({}))
vi.mock('../../../helpers/mailer.js', () => ({}))
vi.mock('../../../helpers/emailPreferences.js', () => ({}))

const start = new Date('2026-10-06T01:00:00Z')
const now = new Date('2026-10-06T01:00:45Z')

describe('stepTiming', () => {
  it('starts the clock when a step begins running', () => {
    expect(stepTiming(undefined, 'Running', now)).toEqual({ started_at: now })
  })

  it('keeps the original start when a running step reports again', () => {
    const previous = { status: 'Running' as const, started_at: start }
    expect(stepTiming(previous, 'Running', now)).toEqual({ started_at: start })
  })

  it.each(['Success', 'Error'] as const)(
    'closes the step with its duration on %s',
    (status) => {
      const previous = { status: 'Running' as const, started_at: start }
      expect(stepTiming(previous, status, now)).toEqual({
        started_at: start,
        completed_at: now,
        duration_ms: 45_000
      })
    }
  )

  it('records only the finish time for a step that never reported Running', () => {
    expect(stepTiming(undefined, 'Success', now)).toEqual({ completed_at: now })
  })

  it('clears the timing when a step goes back to Waiting', () => {
    const previous = { status: 'Running' as const, started_at: start }
    expect(stepTiming(previous, 'Waiting', now)).toEqual({})
  })
})
