import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import { BilboMDScoperTable } from '../BilboMDScoperTable'
import type { ScoperJobResults } from '@bilbomd/bilbomd-types'

const mockResults: ScoperJobResults = {
  kgs_conformations: 10,
  kgs_files: 5,
  foxs_top_file: 'top.dat',
  multifoxs_ensemble_size: 3
}

describe('BilboMDScoperTable', () => {
  it('renders all row labels', () => {
    renderWithProviders(<BilboMDScoperTable results={mockResults} />)

    expect(
      screen.getByText('KGS Number of Conformations to Generate')
    ).toBeInTheDocument()
    expect(screen.getByText('KGS Progress')).toBeInTheDocument()
    expect(screen.getByText('FoXS Top File')).toBeInTheDocument()
    expect(
      screen.getByText('Number of predicted Mg ions')
    ).toBeInTheDocument()
    expect(screen.getByText('KGS Progress Bar')).toBeInTheDocument()
  })

  it('renders correct values from props', () => {
    renderWithProviders(<BilboMDScoperTable results={mockResults} />)

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('top.dat')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('calculates and displays correct progress percentage', () => {
    // 5 / 10 * 100 = 50%
    renderWithProviders(<BilboMDScoperTable results={mockResults} />)

    expect(screen.getByText('50%')).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '50')
  })

  it('shows 0% when kgs_conformations is 0 (division-by-zero guard)', () => {
    const zeroResults: ScoperJobResults = {
      ...mockResults,
      kgs_conformations: 0,
      kgs_files: 0
    }
    renderWithProviders(<BilboMDScoperTable results={zeroResults} />)

    expect(screen.getByText('0%')).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows 0% when kgs_conformations is undefined', () => {
    const undefinedResults: ScoperJobResults = {
      foxs_top_file: 'top.dat',
      multifoxs_ensemble_size: 2
    }
    renderWithProviders(<BilboMDScoperTable results={undefinedResults} />)

    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
