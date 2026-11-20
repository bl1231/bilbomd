import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeContextProvider } from 'themes/ThemeContextProvider'
import { useThemeContext } from 'themes/ThemeContext'
import { COLOR_SCHEME_STORAGE_KEY } from 'themes/useColorTheme'
import { ColorSchemeControl, ColorSchemeToggle } from '../ColorSchemeToggle'

const ModeProbe = () => {
  const { mode } = useThemeContext()
  return <span data-testid="mode">{mode}</span>
}

const renderInTheme = (ui: React.ReactElement) =>
  render(
    <ThemeContextProvider>
      {ui}
      <ModeProbe />
    </ThemeContextProvider>
  )

describe('ColorSchemeToggle', () => {
  afterEach(() => localStorage.clear())

  it('switches light to dark and remembers the choice', async () => {
    const user = userEvent.setup()
    renderInTheme(<ColorSchemeToggle />)

    await user.click(
      screen.getByRole('button', { name: 'Switch to dark mode' })
    )

    expect(
      screen.getByRole('button', { name: 'Switch to light mode' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
  })

  it('starts from a saved dark choice and switches back to light', async () => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'dark')
    const user = userEvent.setup()
    renderInTheme(<ColorSchemeToggle />)

    await user.click(
      screen.getByRole('button', { name: 'Switch to light mode' })
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('light')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light')
  })
})

describe('ColorSchemeControl', () => {
  afterEach(() => localStorage.clear())

  it('offers light, system and dark, and remembers the choice', async () => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'light')
    const user = userEvent.setup()
    renderInTheme(<ColorSchemeControl />)

    const light = screen.getByRole('button', { name: 'Light' })
    const system = screen.getByRole('button', { name: 'System' })
    const dark = screen.getByRole('button', { name: 'Dark' })
    expect(light).toHaveAttribute('aria-pressed', 'true')

    await user.click(dark)
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')

    await user.click(system)
    expect(system).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('system')
  })

  it('keeps the choice when the selected option is clicked again', async () => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'dark')
    const user = userEvent.setup()
    renderInTheme(<ColorSchemeControl />)

    await user.click(screen.getByRole('button', { name: 'Dark' }))

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
  })
})
