import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNow } from '../useNow'

afterEach(() => {
  vi.useRealTimers()
})

describe('useNow', () => {
  it('ticks every second while active', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const { result } = renderHook(() => useNow(true))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.toISOString()).toBe('2026-09-01T00:00:03.000Z')
  })

  it('stays put while inactive', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const { result } = renderHook(() => useNow(false))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})
