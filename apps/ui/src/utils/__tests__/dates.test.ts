import { describe, it, expect } from 'vitest'
import {
  parseDateSafe,
  formatDateSafe,
  formatRelativeDateSafe
} from '../dates'

describe('parseDateSafe', () => {
  it('returns null for null/undefined/empty/whitespace', () => {
    expect(parseDateSafe(null)).toBeNull()
    expect(parseDateSafe(undefined)).toBeNull()
    expect(parseDateSafe('')).toBeNull()
    expect(parseDateSafe('   ')).toBeNull()
  })

  it('returns the same valid Date instance', () => {
    const d = new Date('2023-01-01T00:00:00Z')
    const parsed = parseDateSafe(d)
    expect(parsed).toBe(d)
  })

  it('returns null for invalid Date instance', () => {
    const invalid = new Date('not-a-date')
    expect(parseDateSafe(invalid)).toBeNull()
  })

  it('parses numeric timestamps (ms since epoch)', () => {
    const ts = Date.UTC(2023, 0, 1, 0, 0, 0)
    const parsed = parseDateSafe(ts)
    expect(parsed).not.toBeNull()
    expect(parsed!.toISOString()).toBe('2023-01-01T00:00:00.000Z')
  })

  it('parses ISO date without time', () => {
    const parsed = parseDateSafe('2023-01-01')
    expect(parsed).not.toBeNull()
    // Using toISOString to avoid locale/timezone formatting differences
    expect(parsed!.toISOString().startsWith('2023-01-01')).toBe(true)
  })

  it('normalizes space-separated datetime by adding Z (UTC)', () => {
    const parsed = parseDateSafe('2023-01-01 12:34:56')
    expect(parsed).not.toBeNull()
    expect(parsed!.toISOString()).toBe('2023-01-01T12:34:56.000Z')
  })

  it('respects explicit timezone offsets', () => {
    const parsed = parseDateSafe('2023-01-01T12:34:56+02:00')
    expect(parsed).not.toBeNull()
    expect(parsed!.toISOString()).toBe('2023-01-01T10:34:56.000Z')
  })

  it('returns null for invalid strings', () => {
    expect(parseDateSafe('not a date')).toBeNull()
  })
})

describe('formatDateSafe', () => {
  it('returns fallback when date cannot be parsed', () => {
    expect(formatDateSafe(null, 'MM/dd/yyyy', 'N/A')).toBe('N/A')
    expect(formatDateSafe('bad-date', 'MM/dd/yyyy', 'fallback')).toBe(
      'fallback'
    )
  })

  it('formats with default pattern into a recognizable shape', () => {
    const output = formatDateSafe('2023-01-01T12:34:56Z')
    expect(output).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)
  })

  it('supports custom valid patterns', () => {
    const out = formatDateSafe('2023-06-15T12:00:00Z', 'yyyy-MM-dd')
    // Shape-only assertion to avoid timezone flakiness
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns fallback on invalid pattern tokens', () => {
    // date-fns v2 uses lowercase tokens; uppercase causes an error
    const out = formatDateSafe('2023-01-01T00:00:00Z', 'YYYY-MM-DD', 'oops')
    expect(out).toBe('oops')
  })
})

describe('formatRelativeDateSafe', () => {
  it('returns fallback for unparseable input', () => {
    expect(formatRelativeDateSafe(null)).toBe('')
    expect(formatRelativeDateSafe('not a date', 'n/a')).toBe('n/a')
  })

  it('formats a past date as a relative "ago" string', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    expect(formatRelativeDateSafe(twoHoursAgo)).toBe('2 hours ago')
  })
})
