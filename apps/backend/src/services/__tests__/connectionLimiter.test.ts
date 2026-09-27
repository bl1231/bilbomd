import { describe, it, expect } from 'vitest'
import { createConnectionLimiter } from '../connectionLimiter.js'

describe('createConnectionLimiter', () => {
  it('allows up to max open connections per key', () => {
    const limiter = createConnectionLimiter(2)

    expect(limiter.tryAcquire('a')).toBe(true)
    expect(limiter.tryAcquire('a')).toBe(true)
    expect(limiter.tryAcquire('a')).toBe(false)
    expect(limiter.tryAcquire('b')).toBe(true)
  })

  it('frees a slot on release', () => {
    const limiter = createConnectionLimiter(1)
    limiter.tryAcquire('a')

    limiter.release('a')

    expect(limiter.openCount('a')).toBe(0)
    expect(limiter.tryAcquire('a')).toBe(true)
  })

  it('never goes below zero', () => {
    const limiter = createConnectionLimiter(1)

    limiter.release('a')

    expect(limiter.openCount('a')).toBe(0)
    expect(limiter.tryAcquire('a')).toBe(true)
    expect(limiter.tryAcquire('a')).toBe(false)
  })
})
