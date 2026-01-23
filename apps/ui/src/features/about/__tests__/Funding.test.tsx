import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import Funding from '../Funding'

describe('Funding', () => {
  it('sets page title and renders Funding heading', () => {
    renderWithProviders(<Funding />)
    expect(
      screen.getByRole('heading', { name: /Funding/i })
    ).toBeInTheDocument()
  })

  it('renders funding body content', () => {
    renderWithProviders(<Funding />)
    expect(
      screen.getByText(
        /Development of BilboMD was performed at the Advanced Light Source/i
      )
    ).toBeInTheDocument()
  })

  it('renders acknowledgments heading and body', () => {
    renderWithProviders(<Funding />)
    expect(
      screen.getByRole('heading', { name: /Acknowledgements/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/We are grateful for the patience of our early users/i)
    ).toBeInTheDocument()
  })
})
