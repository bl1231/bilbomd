import { screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import FeedbackChart from '../FeedbackChart'
import { renderWithProviders } from 'test/test-utils'

const mockData = {
  q_ranges: [0.01, 0.1, 0.2, 0.4],
  chi_squares_of_regions: [0.8, 1.5, 2.5],
  residuals_of_regions: [0.02, 0.05, 0.1]
}

describe('FeedbackChart', () => {
  it('renders the chart title', () => {
    renderWithProviders(<FeedbackChart data={mockData} />)
    expect(
      screen.getByText('Chi² and Residuals vs. Q Ranges')
    ).toBeInTheDocument()
  })

  it('renders the chart in a responsive container instead of a fixed width', () => {
    const { container } = renderWithProviders(<FeedbackChart data={mockData} />)
    const responsive = container.querySelector('.recharts-responsive-container')
    expect(responsive).not.toBeNull()
    expect(responsive).toHaveStyle({ width: '100%' })
  })
})
