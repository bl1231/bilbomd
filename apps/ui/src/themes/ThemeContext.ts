import { createContext, useContext } from 'react'
import { createTheme, PaletteMode, Theme } from '@mui/material'
import type { ColorSchemePreference } from './useColorTheme'

type ThemeContextType = {
  /** The scheme in effect, after resolving 'system' */
  mode: PaletteMode
  /** What the user picked */
  preference: ColorSchemePreference
  setPreference: (preference: ColorSchemePreference) => void
  toggleColorMode: () => void
  theme: Theme
}

// Create the context
export const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  preference: 'system',
  setPreference: () => {},
  toggleColorMode: () => {},
  theme: createTheme()
})

// Hook to use the context
export const useThemeContext = () => useContext(ThemeContext)
