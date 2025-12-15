import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import Acknowledgments from '../Acknowledgments'

describe('Acknowledgments', () => {
  it('renders referencing section heading', () => {
    renderWithProviders(<Acknowledgments />)
    expect(screen.getByText(/Referencing BilboMD:/i)).toBeInTheDocument()
  })

  it('includes manuscript citation with PubMed link', () => {
    renderWithProviders(<Acknowledgments />)
    expect(screen.getByRole('link', { name: /19592714/i })).toBeInTheDocument()
  })

  it('lists external tools and citations', () => {
    renderWithProviders(<Acknowledgments />)
    // Multiple CHARMM-related links exist (CHARMM, CHARMM-GUI)
    expect(
      screen.getAllByRole('link', { name: /CHARMM/i }).length
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /FoXS/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /MultiFoXS/i })).toBeInTheDocument()
  })
})
