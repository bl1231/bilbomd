import { screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ResidualsChart from '../ResidualsChart'
import { renderWithProviders } from 'test/test-utils'
import { reportV2 } from './fixtures'

const regions = reportV2.regions!

describe('ResidualsChart', () => {
  it('renders in a responsive container with its explanation', () => {
    const { container } = renderWithProviders(
      <ResidualsChart
        points={[
          { q: 0.01, residual: 0.5 },
          { q: 0.15, residual: -1.5 },
          { q: 0.3, residual: 0.25 }
        ]}
        regions={regions}
      />
    )
    expect(
      screen.getByText('Residuals of the assessed model')
    ).toBeInTheDocument()
    expect(
      container.querySelector('.recharts-responsive-container')
    ).not.toBeNull()
    expect(screen.queryByText(/drawn at the edge/)).not.toBeInTheDocument()
  })

  it('says how many points lie beyond the axis', () => {
    renderWithProviders(
      <ResidualsChart
        points={[
          { q: 0.01, residual: 0.5 },
          { q: 0.15, residual: -30 },
          { q: 0.3, residual: 20 }
        ]}
        regions={regions}
      />
    )
    expect(
      screen.getByText(/2 points lie beyond ±8 σ and are drawn at the edge/)
    ).toBeInTheDocument()
  })
})
