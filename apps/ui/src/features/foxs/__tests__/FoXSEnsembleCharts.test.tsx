import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoXSEnsembleCharts from '../FoXSEnsembleCharts'
import { getEnsembleSizeLabel } from '../foxsUtils'
import type { FoxsData } from '@bilbomd/bilbomd-types'

const makeDataPoint = () => ({
  q: 0.01,
  exp_intensity: 100.0,
  model_intensity: 99.0,
  error: 1.0
})

const baseFoxsData: FoxsData = {
  filename: 'sample.dat',
  chisq: 2.0,
  c1: '1.0',
  c2: '0.0',
  data: [makeDataPoint()]
}

const make1State = (): FoxsData => ({
  filename: 'multi_state_model_1_1_1.dat',
  chisq: 1.5,
  c1: '1.0',
  c2: '0.0',
  data: [makeDataPoint()]
})

const make2State = (): FoxsData => ({
  filename: 'multi_state_model_2_1_1.dat',
  chisq: 1.2,
  c1: '0.95',
  c2: '0.05',
  data: [makeDataPoint()]
})

describe('getEnsembleSizeLabel', () => {
  it('extracts ensemble size N from multi_state_model_N_1_1.dat filename', () => {
    expect(getEnsembleSizeLabel('multi_state_model_1_1_1.dat')).toBe(
      'Ens. Size 1'
    )
    expect(getEnsembleSizeLabel('multi_state_model_2_1_1.dat')).toBe(
      'Ens. Size 2'
    )
    expect(getEnsembleSizeLabel('multi_state_model_10_1_1.dat')).toBe(
      'Ens. Size 10'
    )
  })

  it('returns fallback label for unrecognised filename', () => {
    expect(getEnsembleSizeLabel('unknown.dat')).toBe('Ens. Size unknown.dat')
  })
})

describe('FoXSEnsembleCharts', () => {
  const defaultProps = {
    combinedData: [
      {
        q: 0.01,
        exp_intensity: 100.0,
        model_intensity_0: 99.0,
        model_intensity_1: 98.5,
        residual_0: 0.5,
        residual_1: 0.3
      }
    ],
    minYAxis: -3,
    maxYAxis: 3
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing with 1-state and 2-state ensemble', () => {
    const foxsData: FoxsData[] = [baseFoxsData, make1State(), make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(screen.getByText('Ensemble Models - I vs. q')).toBeInTheDocument()
  })

  it('shows a chip for each ensemble for 1-state and 2-state', () => {
    const foxsData: FoxsData[] = [baseFoxsData, make1State(), make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(screen.getByText('Ens. Size 1: 1.50')).toBeInTheDocument()
    expect(screen.getByText('Ens. Size 2: 1.20')).toBeInTheDocument()
  })

  it('shows only the 2-state chip when only 2-state is present', () => {
    // Simulates back-end sending [base, 2-state] (no 1-state)
    const foxsData: FoxsData[] = [baseFoxsData, make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(screen.getByText('Ens. Size 2: 1.20')).toBeInTheDocument()
    expect(screen.queryByText('Ens. Size 1: 1.50')).not.toBeInTheDocument()
  })

  // Part of #971: chi² is surfaced in a header line above the residuals plot,
  // colour-keyed to each ensemble trace. The base dataset (index 0) has its
  // own Original Model charts, so it gets no chip here.
  it('does not render a chip for the base dataset', () => {
    const foxsData: FoxsData[] = [baseFoxsData, make1State(), make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(screen.queryByText(/sample\.dat: /)).not.toBeInTheDocument()
  })

  it('toggles ensemble visibility when its chip is clicked', async () => {
    const user = userEvent.setup()
    const foxsData: FoxsData[] = [baseFoxsData, make1State(), make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    const chip2 = screen.getByText('Ens. Size 2: 1.20').closest('[aria-pressed]')
    expect(chip2).toHaveAttribute('aria-pressed', 'true')

    await user.click(chip2!)
    expect(chip2).toHaveAttribute('aria-pressed', 'false')

    await user.click(chip2!)
    expect(chip2).toHaveAttribute('aria-pressed', 'true')

    // The other ensemble is unaffected
    expect(
      screen.getByText('Ens. Size 1: 1.50').closest('[aria-pressed]')
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
