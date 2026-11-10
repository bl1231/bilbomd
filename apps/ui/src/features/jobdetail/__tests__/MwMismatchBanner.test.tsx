import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from 'test/rendersWithProviders'
import MwMismatchBanner from '../MwMismatchBanner'

describe('MwMismatchBanner', () => {
  it('states both masses and the difference', () => {
    renderWithProviders(
      <MwMismatchBanner
        mismatch={{ modelKda: 43.6, saxsKda: 81.5, diffFraction: 0.869 }}
        onShowDetails={vi.fn()}
      />
    )
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(
      'Your model and your SAXS data may not match'
    )
    expect(banner).toHaveTextContent('The model weighs 43.6 kDa')
    expect(banner).toHaveTextContent('about 81.5 kDa (87% higher)')
    // Only a heavier-than-expected sample can be explained by aggregation
    expect(banner).toHaveTextContent('not aggregated')
  })

  it('does not suggest aggregation when the data are lighter than the model', () => {
    renderWithProviders(
      <MwMismatchBanner
        mismatch={{ modelKda: 82.2, saxsKda: 40, diffFraction: -0.513 }}
        onShowDetails={vi.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('(51% lower)')
    expect(screen.getByRole('alert')).not.toHaveTextContent('aggregated')
  })

  it('opens the details on request', async () => {
    const onShowDetails = vi.fn()
    renderWithProviders(
      <MwMismatchBanner
        mismatch={{ modelKda: 43.6, saxsKda: 81.5, diffFraction: 0.869 }}
        onShowDetails={onShowDetails}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'See details' }))
    expect(onShowDetails).toHaveBeenCalledTimes(1)
  })
})
