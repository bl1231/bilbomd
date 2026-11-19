import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLOR_SCHEME_STORAGE_KEY, useColorTheme } from '../useColorTheme'

const originalMatchMedia = window.matchMedia

const stubPrefersDark = (dark: boolean) => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia
}

describe('useColorTheme', () => {
  afterEach(() => {
    localStorage.clear()
    window.matchMedia = originalMatchMedia
  })

  it('follows the system by default', () => {
    stubPrefersDark(true)
    const { result } = renderHook(() => useColorTheme())
    expect(result.current.preference).toBe('system')
    expect(result.current.mode).toBe('dark')
    expect(result.current.theme.palette.mode).toBe('dark')
  })

  it('resolves system to light when the OS prefers light', () => {
    stubPrefersDark(false)
    const { result } = renderHook(() => useColorTheme())
    expect(result.current.mode).toBe('light')
  })

  it('starts from a saved choice, overriding the system', () => {
    stubPrefersDark(true)
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'light')
    const { result } = renderHook(() => useColorTheme())
    expect(result.current.preference).toBe('light')
    expect(result.current.mode).toBe('light')
  })

  it('ignores an unknown saved value', () => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'purple')
    const { result } = renderHook(() => useColorTheme())
    expect(result.current.preference).toBe('system')
  })

  it('saves a new preference', () => {
    const { result } = renderHook(() => useColorTheme())
    act(() => result.current.setPreference('dark'))
    expect(result.current.mode).toBe('dark')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
  })

  it('toggles from the scheme in effect to an explicit choice', () => {
    stubPrefersDark(true)
    const { result } = renderHook(() => useColorTheme())
    act(() => result.current.toggleColorMode())
    expect(result.current.preference).toBe('light')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light')
  })
})
