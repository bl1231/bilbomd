// apps/ui/src/features/scoperjob/__tests__/FoXSChart.test.tsx

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FoXSChart from '../FoXSChart'

const defaultProps = {
  title: 'Original Model',
  data: [
    { q: 0.01, exp_intensity: 100.0, model_intensity: 98.0, error: 2.0 },
    { q: 0.02, exp_intensity: 85.0, model_intensity: 84.0, error: 1.5 }
  ],
  residualsData: [
    { q: 0.01, res: 1.0 },
    { q: 0.02, res: -0.5 }
  ],
  chisq: 1.42,
  c1: '1.01',
  c2: '2.00',
  minYAxis: -3,
  maxYAxis: 3
}

describe('FoXSChart', () => {
  it('renders both chart headings', () => {
    render(<FoXSChart {...defaultProps} />)
    expect(screen.getByText('Original Model - I vs. q')).toBeInTheDocument()
    expect(
      screen.getByText(/Original Model - Chi² residuals/)
    ).toBeInTheDocument()
  })

  // Regression test for #971: the Chi²/C1/C2 values used to be raw SVG <text>
  // painted inside the residuals plot area, where the residual trace could
  // draw over them. They now live in a DOM header line above the plot.
  it('renders Chi², C1 and C2 as DOM text outside the plot area', () => {
    const { container } = render(<FoXSChart {...defaultProps} />)

    expect(screen.getByText(/Chi²: 1\.42/)).toBeInTheDocument()
    expect(screen.getByText(/1\.01/)).toBeInTheDocument()
    expect(screen.getByText(/2\.00/)).toBeInTheDocument()

    // None of the stat values should be rendered as SVG <text> nodes.
    const svgText = Array.from(container.querySelectorAll('svg text')).map(
      (node) => node.textContent ?? ''
    )
    expect(svgText.some((text) => text.includes('1.42'))).toBe(false)
  })

  it('renders the excluded-points warning only when points were excluded', () => {
    const { rerender } = render(<FoXSChart {...defaultProps} />)
    expect(screen.queryByText(/excluded from/)).not.toBeInTheDocument()

    rerender(
      <FoXSChart
        {...defaultProps}
        excludedCount={2}
        excludedRanges={[{ x1: 0.3, x2: 0.4 }]}
      />
    )
    expect(screen.getByText(/2 points excluded from/)).toBeInTheDocument()
  })
})
