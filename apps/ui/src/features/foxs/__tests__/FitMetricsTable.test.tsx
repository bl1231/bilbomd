import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import FitMetricsTable from '../FitMetricsTable'
import type { FoxsData, FitMetricsInfo } from '@bilbomd/bilbomd-types'

const fitMetrics: FitMetricsInfo = {
  dmax: 90.4,
  dmaxSource: 'guinier_rg',
  dmaxPerRg: 3,
  shannonChannels: 12,
  chi2freeRounds: 1000,
  vrQmax: 0.3
}

const fit = (filename: string, extra: Partial<FoxsData> = {}): FoxsData => ({
  filename,
  chisq: 2.345,
  c1: '1.0',
  c2: '0.0',
  data: [],
  ...extra
})

const rows = () => screen.getAllByRole('row').slice(1) // skip header

describe('FitMetricsTable', () => {
  it('shows χ², χ²free and Vr for the original model and each ensemble size', () => {
    render(
      <FitMetricsTable
        fitMetrics={fitMetrics}
        foxsData={[
          fit('minimization_output_exp.dat', { chi2free: 1.87, vr: 0.4321 }),
          fit('multi_state_model_1_1_1.dat', {
            chisq: 1.2,
            chi2free: 1.05,
            vr: 0.1
          }),
          fit('multi_state_model_2_1_1.dat', {
            chisq: 1.1,
            chi2free: 1.02,
            vr: 0.0874
          })
        ]}
      />
    )

    expect(
      screen.getByRole('table', { name: 'Fit quality metrics' })
    ).toBeInTheDocument()
    const cells = rows().map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    )
    expect(cells).toEqual([
      ['Original model', '2.35', '1.87', '0.432'],
      ['Ens. Size 1', '1.20', '1.05', '0.100'],
      ['Ens. Size 2', '1.10', '1.02', '0.087']
    ])
  })

  it('shows a dash when a metric could not be computed', () => {
    render(
      <FitMetricsTable
        fitMetrics={fitMetrics}
        foxsData={[fit('multi_state_model_1_1_1.dat')]}
      />
    )

    const cells = within(rows()[0]!).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('—')
    expect(cells[3]).toHaveTextContent('—')
  })

  it('explains the Dmax estimate and marks the metrics as beta', () => {
    render(
      <FitMetricsTable
        fitMetrics={fitMetrics}
        foxsData={[fit('minimization_output_exp.dat', { chi2free: 1, vr: 0 })]}
      />
    )

    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(
      screen.getByText(/Dmax ≈ 90 Å estimated as 3 × the/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/12 channels, χ²free over 1000 random subsets/)
    ).toBeInTheDocument()
    expect(screen.getByText(/Vr only uses q ≤ 0.3 Å⁻¹/)).toBeInTheDocument()
  })
})
