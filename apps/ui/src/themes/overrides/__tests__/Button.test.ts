import { describe, it, expect } from 'vitest'
import { createTheme, alpha } from '@mui/material/styles'
import Button from '../Button'

const detailsButtonStyle = (mode: 'light' | 'dark') => {
  const theme = createTheme({ palette: { mode } })
  const style =
    Button(theme).MuiButton.styleOverrides.root['&.job-details-button']
  return { theme, style }
}

describe('Button overrides: job-details-button', () => {
  it('keeps the light grey background in light mode', () => {
    const { theme, style } = detailsButtonStyle('light')
    expect(style.backgroundColor).toBe(theme.palette.grey[200])
    expect(style['&:hover']).toEqual({ backgroundColor: 'white' })
  })

  it('uses a primary tint in dark mode so the text stays readable', () => {
    const { theme, style } = detailsButtonStyle('dark')
    expect(style.backgroundColor).toBe(alpha(theme.palette.primary.main, 0.12))
    expect(style['&:hover']).toEqual({
      backgroundColor: alpha(theme.palette.primary.main, 0.24)
    })
  })
})
