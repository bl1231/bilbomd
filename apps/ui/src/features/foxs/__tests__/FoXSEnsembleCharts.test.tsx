import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('shows correct filenames in the table for 1-state and 2-state', () => {
    const foxsData: FoxsData[] = [baseFoxsData, make1State(), make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(
      screen.getByText('multi_state_model_1_1_1.dat')
    ).toBeInTheDocument()
    expect(
      screen.getByText('multi_state_model_2_1_1.dat')
    ).toBeInTheDocument()
  })

  it('shows correct filename in the table when only 2-state is present', () => {
    // Simulates back-end sending [base, 2-state] (no 1-state)
    const foxsData: FoxsData[] = [baseFoxsData, make2State()]
    render(
      <FoXSEnsembleCharts
        {...defaultProps}
        foxsData={foxsData}
      />
    )
    expect(
      screen.getByText('multi_state_model_2_1_1.dat')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('multi_state_model_1_1_1.dat')
    ).not.toBeInTheDocument()
  })
})
