import { createTheme, PaletteMode, useMediaQuery } from '@mui/material'
import { useMemo, useState } from 'react'
import { getDesignTokens } from './theme'

/** What the user picked; 'system' follows the OS setting as it changes. */
export type ColorSchemePreference = 'light' | 'system' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'bilbomd-color-scheme'

const isPreference = (value: unknown): value is ColorSchemePreference =>
  value === 'light' || value === 'system' || value === 'dark'

const readPreference = (): ColorSchemePreference => {
  try {
    const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    return isPreference(saved) ? saved : 'system'
  } catch {
    // Storage blocked (private mode, sandboxed iframe)
    return 'system'
  }
}

const savePreference = (preference: ColorSchemePreference) => {
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, preference)
  } catch {
    // The choice still applies for this visit
  }
}

export const useColorTheme = () => {
  const [preference, setPreferenceState] =
    useState<ColorSchemePreference>(readPreference)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true
  })

  const mode: PaletteMode =
    preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference

  const setPreference = (next: ColorSchemePreference) => {
    savePreference(next)
    setPreferenceState(next)
  }

  const toggleColorMode = () => {
    setPreference(mode === 'light' ? 'dark' : 'light')
  }

  const modifiedTheme = useMemo(
    () => createTheme(getDesignTokens(mode)),
    [mode]
  )

  return {
    theme: modifiedTheme,
    mode,
    preference,
    setPreference,
    toggleColorMode
  }
}
