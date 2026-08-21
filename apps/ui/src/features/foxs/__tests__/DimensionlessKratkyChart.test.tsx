import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DimensionlessKratkyChart from '../DimensionlessKratkyChart'
import {
  buildKratkyData,
  GLOBULAR_QRG,
  GLOBULAR_PEAK,
  DEFAULT_MAX_QRG
} from '../kratkyUtils'
import type { FoxsData, GuinierFit } from '@bilbomd/bilbomd-types'

const guinier: GuinierFit = {
  rg: 20,
  i0: 1000,
  qmin: 0.012,
  qmax: 0.032,
  r2: 0.99
}

const makeFoxsData = (points: FoxsData['data']): FoxsData => ({
  filename: 'minimization_output_experiment.dat',
  chisq: 1.5,
  c1: '1.0',
  c2: '0.0',
  data: points
})

describe('globular reference constants', () => {
  it('places the crosshairs at (√3, 3/e)', () => {
    expect(GLOBULAR_QRG).toBeCloseTo(1.732, 3)
    expect(GLOBULAR_PEAK).toBeCloseTo(1.104, 3)
  })
})

describe('buildKratkyData', () => {
  it('transforms points into dimensionless Kratky coordinates', () => {
    const foxsData = [
      makeFoxsData([
        { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 }
      ])
    ]
    const [pt] = buildKratkyData(foxsData, guinier)

    // qRg = 0.05 * 20 = 1; y_exp = 1² * 500/1000 = 0.5
    expect(pt!.qRg).toBeCloseTo(1.0, 4)
    expect(pt!.exp).toBeCloseTo(0.5, 4)
    expect(pt!.kratky_model_0).toBeCloseTo(0.49, 4)
  })

  it('includes ensemble model curves on the shared q-grid', () => {
    const base = makeFoxsData([
      { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 }
    ])
    const ensemble = {
      ...makeFoxsData([
        { q: 0.05, exp_intensity: 500, model_intensity: 510, error: 5 }
      ]),
      filename: 'multi_state_model_2_1_1.dat'
    }
    const [pt] = buildKratkyData([base, ensemble], guinier)

    expect(pt!.kratky_model_1).toBeCloseTo(0.51, 4)
  })

  it('excludes low-SNR points (error >= exp_intensity) and non-positive intensities', () => {
    const foxsData = [
      makeFoxsData([
        { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 },
        { q: 0.3, exp_intensity: 2, model_intensity: 2, error: 3 },
        { q: 0.35, exp_intensity: -1, model_intensity: 1, error: 1 }
      ])
    ]
    const points = buildKratkyData(foxsData, guinier)
    expect(points).toHaveLength(1)
  })

  it(`caps the displayed range at qRg = ${DEFAULT_MAX_QRG}`, () => {
    const foxsData = [
      makeFoxsData([
        { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 },
        // qRg = 0.6 * 20 = 12 > cap
        { q: 0.6, exp_intensity: 100, model_intensity: 99, error: 1 }
      ])
    ]
    const points = buildKratkyData(foxsData, guinier)
    expect(points).toHaveLength(1)
    expect(points[0]!.qRg).toBeLessThanOrEqual(DEFAULT_MAX_QRG)
  })

  it('returns empty for degenerate Guinier parameters', () => {
    const foxsData = [
      makeFoxsData([
        { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 }
      ])
    ]
    expect(buildKratkyData(foxsData, { ...guinier, i0: 0 })).toHaveLength(0)
    expect(buildKratkyData(foxsData, { ...guinier, rg: 0 })).toHaveLength(0)
    expect(buildKratkyData([], guinier)).toHaveLength(0)
  })
})

describe('DimensionlessKratkyChart', () => {
  const foxsData = [
    makeFoxsData([
      { q: 0.05, exp_intensity: 500, model_intensity: 490, error: 5 },
      { q: 0.1, exp_intensity: 200, model_intensity: 195, error: 3 }
    ])
  ]

  it('renders the title and Guinier fit parameters', () => {
    render(
      <DimensionlessKratkyChart
        foxsData={foxsData}
        guinier={guinier}
      />
    )
    expect(screen.getByText('Dimensionless Kratky')).toBeInTheDocument()
    expect(screen.getByText('20.00 Å')).toBeInTheDocument()
    expect(screen.getByText('1.00e+3')).toBeInTheDocument()
    expect(screen.getByText(/0\.0120–0\.0320/)).toBeInTheDocument()
    expect(screen.getByText('0.990')).toBeInTheDocument()
  })

  it('renders nothing when no plottable points remain', () => {
    const noisy = [
      makeFoxsData([
        { q: 0.05, exp_intensity: 2, model_intensity: 2, error: 5 }
      ])
    ]
    const { container } = render(
      <DimensionlessKratkyChart
        foxsData={noisy}
        guinier={guinier}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
