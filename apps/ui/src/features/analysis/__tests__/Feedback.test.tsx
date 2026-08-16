import { cloneElement, type ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FeedbackChart from '../FeedbackChart'

// jsdom has no layout, so ResponsiveContainer measures 0x0 and never mounts
// the chart. Substitute a fixed size so the chart contents render.
vi.mock('recharts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('recharts')>()
  return {
    ...mod,
    ResponsiveContainer: ({
      children
    }: {
      children: ReactElement<{ width?: number; height?: number }>
    }) => cloneElement(children, { width: 600, height: 350 })
  }
})

describe('FeedbackChart', () => {
  const mockData = {
    q_ranges: [0.01, 0.1, 0.2, 0.4],
    chi_squares_of_regions: [1.2, 0.9, 1.5],
    residuals_of_regions: [0.5, 0.7, 0.6]
  }

  it('renders without crashing', () => {
    render(<FeedbackChart data={mockData} />)
    expect(
      screen.getByText(/Chi² and Residuals vs. Q Ranges/i)
    ).toBeInTheDocument()
  })

  it('renders the X and Y axes', () => {
    const { container } = render(<FeedbackChart data={mockData} />)
    expect(container.querySelector('.recharts-xAxis')).not.toBeNull()
    expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(2)
  })
})
