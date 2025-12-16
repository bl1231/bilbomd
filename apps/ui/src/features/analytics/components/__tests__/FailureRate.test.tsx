import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import { FailureRate } from '../FailureRate'

vi.mock('slices/analyticsApiSlice', () => ({
  useGetUsageSuccessRateQuery: vi.fn(() => ({
    isLoading: false,
    data: [
      { pipeline: 'pdb', successRate: 0.8, total: 100 },
      { pipeline: 'crd', successRate: 0.5, total: 40 }
    ]
  }))
}))

import { useGetUsageSuccessRateQuery } from 'slices/analyticsApiSlice'

describe('FailureRate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading and success/failure percentages', () => {
    renderWithProviders(<FailureRate />)
    expect(screen.getByText(/Success Rate by Pipeline/i)).toBeInTheDocument()
    expect(
      screen.getByText(/pdb — 80% success \/ 20% failure \(100 events\)/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/crd — 50% success \/ 50% failure \(40 events\)/i)
    ).toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    vi.mocked(useGetUsageSuccessRateQuery).mockReturnValueOnce({
      isLoading: true,
      data: []
    } as unknown as ReturnType<typeof useGetUsageSuccessRateQuery>)
    renderWithProviders(<FailureRate />)
    // Loading shows a Skeleton instead of content; ensure content not present
    expect(
      screen.queryByText(/success \/ 20% failure/i)
    ).not.toBeInTheDocument()
  })

  it('shows empty state when no data', () => {
    vi.mocked(useGetUsageSuccessRateQuery).mockReturnValueOnce({
      isLoading: false,
      data: []
    } as unknown as ReturnType<typeof useGetUsageSuccessRateQuery>)
    renderWithProviders(<FailureRate />)
    expect(
      screen.getByText(/No usage events for the selected range/i)
    ).toBeInTheDocument()
  })
})
