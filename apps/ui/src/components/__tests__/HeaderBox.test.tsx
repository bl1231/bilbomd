import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { getDesignTokens } from 'themes/theme'
import HeaderBox from '../HeaderBox'

const renderInTheme = (ui: React.ReactElement, mode: 'light' | 'dark') =>
  render(<ThemeProvider theme={getDesignTokens(mode)}>{ui}</ThemeProvider>)

describe('HeaderBox', () => {
  it('renders children correctly', () => {
    render(<HeaderBox>Test Header</HeaderBox>)
    expect(screen.getByText('Test Header')).toBeInTheDocument()
  })

  it('applies default styles correctly', () => {
    renderInTheme(<HeaderBox>Styled Header</HeaderBox>, 'light')
    const headerElement = screen.getByText('Styled Header')

    expect(headerElement).toHaveStyle({
      textTransform: 'uppercase',
      borderTopLeftRadius: '4px',
      borderTopRightRadius: '4px',
      fontWeight: '500',
      // py: 2 -> 16px vertical; padding: '0.5rem' -> 8px horizontal. jsdom >=30
      // resolves rem to absolute px in getComputedStyle (jsdom 29 did not), so
      // this must be asserted in px rather than as '0.5rem'.
      padding: '16px 8px',
      backgroundColor: '#888',
      color: '#fff',
      letterSpacing: '1px'
    })
  })

  it('uses a darker bar in dark mode', () => {
    renderInTheme(<HeaderBox>Dark Header</HeaderBox>, 'dark')
    expect(screen.getByText('Dark Header')).toHaveStyle({
      backgroundColor: '#455a64',
      color: '#fff'
    })
  })

  //  it('applies custom sx prop styles correctly', () => {
  //   render(
  //     <ChakraProvider> {/* Include if using Chakra UI */}
  //       <HeaderBox sx={{ backgroundColor: 'red' }}>
  //         Custom Styled Header
  //       </HeaderBox>
  //     </ChakraProvider>
  //   )
  //   const headerElement = screen.getByText('Custom Styled Header')

  //   // Optional: Debug to inspect styles
  //   // screen.debug(headerElement)

  //   expect(headerElement).toHaveStyle('background-color: red')
  // })
})
