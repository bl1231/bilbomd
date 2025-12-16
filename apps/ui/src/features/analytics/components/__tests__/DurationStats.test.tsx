import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/test-utils'
import { DurationStats } from '../DurationStats'

vi.mock('../../../../slices/analyticsApiSlice', () => ({
  useGetUsageDurationStatsQuery: vi.fn(() => ({
    isLoading: false,
    data: [
      { pipeline: 'pdb', avgMs: 500, p50Ms: 800, p90Ms: 1500, count: 10 },
      { pipeline: 'crd', avgMs: 62000, p50Ms: 1200, p90Ms: 3000, count: 5 }
    ]
  }))
}))
import { useGetUsageDurationStatsQuery } from '../../../../slices/analyticsApiSlice'

describe('DurationStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading and formatted durations', () => {
    renderWithProviders(<DurationStats />)
    expect(
      screen.getByText(/Duration Statistics \(completed jobs\)/i)
    ).toBeInTheDocument()
    // Row for pdb
    expect(screen.getByText('pdb')).toBeInTheDocument()
    expect(screen.getByText('500 ms')).toBeInTheDocument()
    expect(screen.getByText('800 ms')).toBeInTheDocument()
    expect(screen.getByText('1.5 s')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    // Row for crd
    expect(screen.getByText('crd')).toBeInTheDocument()
    expect(screen.getByText('1m 2s')).toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    vi.mocked(useGetUsageDurationStatsQuery).mockReturnValueOnce({
      isLoading: true,
      data: []
    } as unknown as ReturnType<typeof useGetUsageDurationStatsQuery>)
    renderWithProviders(<DurationStats />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
