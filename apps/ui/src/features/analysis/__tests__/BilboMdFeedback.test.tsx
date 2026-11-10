import { screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BilboMdFeedback from '../BilboMdFeedback'
import type { IFeedbackData } from '@bilbomd/mongodb-schema/frontend'
import { renderWithProviders } from 'test/test-utils'

vi.mock('../FeedbackChart', () => ({
  default: () => <div data-testid="feedback-chart" />
}))

const mockFeedback = {
  best_model: 'Model A',
  best_model_dat_file: 'model_a.dat',
  best_ensemble_pdb_file: 'ensemble.pdb',
  overall_chi_square: 1.5,
  mw_saxs: 50,
  mw_model: 55,
  mw_err: 0.08,
  q_ranges: [0.01, 0.1, 0.2, 0.4],
  chi_squares_of_regions: [0.8, 1.5, 2.5],
  residuals_of_regions: [0.02, -0.05, 0.1],
  highest_chi_square_feedback: 'High chi-square detected in region.',
  second_highest_chi_square_feedback: 'Consider revising the model.',
  mw_feedback: 'MW values are within acceptable range.',
  overall_chi_square_feedback: 'Overall chi-square is acceptable.',
  regional_chi_square_feedback: 'Chi-square values vary across regions.',
  timestamp: new Date()
} satisfies IFeedbackData

describe('BilboMdFeedback Component', () => {
  it('renders the best model correctly', () => {
    renderWithProviders(<BilboMdFeedback feedback={mockFeedback} />)
    expect(
      screen.getByText(mockFeedback.best_model_dat_file)
    ).toBeInTheDocument()
  })

  it('renders feedback text correctly', () => {
    renderWithProviders(<BilboMdFeedback feedback={mockFeedback} />)
    expect(
      screen.getByText(mockFeedback.highest_chi_square_feedback)
    ).toBeInTheDocument()
    expect(
      screen.getByText(mockFeedback.second_highest_chi_square_feedback)
    ).toBeInTheDocument()
    expect(screen.getByText(mockFeedback.mw_feedback)).toBeInTheDocument()
    expect(
      screen.getByText(mockFeedback.overall_chi_square_feedback)
    ).toBeInTheDocument()
    expect(
      screen.getByText(mockFeedback.regional_chi_square_feedback)
    ).toBeInTheDocument()
  })

  it('renders residuals of regions correctly, including negative ones', () => {
    renderWithProviders(<BilboMdFeedback feedback={mockFeedback} />)
    mockFeedback.residuals_of_regions.forEach((value) => {
      expect(screen.getByText(value.toFixed(2))).toBeInTheDocument()
    })
  })

  it('labels the q-regions from the data', () => {
    renderWithProviders(<BilboMdFeedback feedback={mockFeedback} />)
    // The data end at 0.40, not at a hard-coded 0.5
    expect(
      screen.getByText('Mean residuals of 0.20 < q < 0.40:')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Mean residuals of 0.01 < q < 0.10:')
    ).toBeInTheDocument()
    expect(screen.queryByText(/q < 0\.5/)).not.toBeInTheDocument()
    expect(screen.getByTestId('feedback-chart')).toBeInTheDocument()
  })

  it('shows both molecular weights', () => {
    renderWithProviders(<BilboMdFeedback feedback={mockFeedback} />)
    expect(screen.getByText('50.0')).toBeInTheDocument()
    expect(screen.getByText('55.0')).toBeInTheDocument()
  })

  it('renders when the molecular-weight comparison is unavailable', () => {
    const feedback: IFeedbackData = {
      ...mockFeedback,
      mw_saxs: null,
      mw_model: null,
      mw_err: null,
      best_ensemble_pdb_file: null,
      mw_feedback: 'Molecular weight not assessed.'
    }
    renderWithProviders(<BilboMdFeedback feedback={feedback} />)

    expect(screen.getAllByText('n/a')).toHaveLength(2)
    expect(
      screen.getByText('Molecular weight not assessed.')
    ).toBeInTheDocument()
    expect(
      screen.getByText(mockFeedback.overall_chi_square_feedback)
    ).toBeInTheDocument()
  })

  it("labels a version 2 report from each region's own bounds", () => {
    // Mid q was skipped for having too few points, so the shared edges in
    // q_ranges would label high q as starting where low q ends
    const feedback: IFeedbackData = {
      ...mockFeedback,
      version: 2,
      q_ranges: [0.01, 0.09, 0.4],
      chi_squares_of_regions: [0.8, 2.5],
      residuals_of_regions: [0.02, 0.1],
      regions: [
        {
          name: 'low',
          q_min: 0.01,
          q_max: 0.09,
          n_points: 80,
          chi_square: 0.8,
          mean_residual: 0.02
        },
        {
          name: 'high',
          q_min: 0.21,
          q_max: 0.4,
          n_points: 190,
          chi_square: 2.5,
          mean_residual: 0.1
        }
      ]
    }
    renderWithProviders(<BilboMdFeedback feedback={feedback} />)

    expect(
      screen.getByText('Mean residuals of 0.21 < q < 0.40:')
    ).toBeInTheDocument()
    expect(screen.queryByText(/0\.09 < q < 0\.40/)).not.toBeInTheDocument()
  })

  it('renders data that cover fewer than three q-regions', () => {
    const feedback: IFeedbackData = {
      ...mockFeedback,
      q_ranges: [0.01, 0.1, 0.15],
      chi_squares_of_regions: [0.8, 1.5],
      residuals_of_regions: [0.02, -0.05],
      second_highest_chi_square_feedback: null,
      regional_chi_square_feedback: null
    }
    renderWithProviders(<BilboMdFeedback feedback={feedback} />)

    expect(
      screen.getByText('Mean residuals of 0.10 < q < 0.15:')
    ).toBeInTheDocument()
    expect(screen.getAllByText(/^Mean residuals of /)).toHaveLength(2)
    // The three-region chart cannot be drawn from two regions
    expect(screen.queryByTestId('feedback-chart')).not.toBeInTheDocument()
  })
})
