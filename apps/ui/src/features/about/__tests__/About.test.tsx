import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import { vi } from 'vitest'
import About from '../About'

vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: vi.fn().mockReturnValue({
    data: { useNersc: 'false' },
    isLoading: false,
    isError: false
  })
}))

describe('About', () => {
  it('renders introduction and pipeline sections', () => {
    renderWithProviders(<About />)

    expect(screen.getByText(/About BilboMD/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Pipeline Options/i })
    ).toBeInTheDocument()
  })

  it('shows config alert for either deployment', () => {
    renderWithProviders(<About />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders feature list content', () => {
    renderWithProviders(<About />)
    expect(
      screen.getByText(
        /Sends an email notification when your job is complete\./i
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText(/BilboMD/i)[0]).toBeInTheDocument()
  })
})
