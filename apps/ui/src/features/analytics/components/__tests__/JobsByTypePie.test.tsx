import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import { JobsByTypePie } from '../JobsByTypePie'

vi.mock('slices/analyticsApiSlice', () => ({
  useGetJobsByTypeQuery: vi.fn(() => ({
    isLoading: false,
    data: [
      { pipeline: 'pdb', count: 12 },
      { pipeline: 'crd', count: 8 }
    ]
  }))
}))
import { useGetJobsByTypeQuery } from 'slices/analyticsApiSlice'

describe('JobsByTypePie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading and legend chips', () => {
    renderWithProviders(<JobsByTypePie />)
    expect(screen.getByText(/Jobs by Pipeline/i)).toBeInTheDocument()
    expect(screen.getByText('pdb: 12')).toBeInTheDocument()
    expect(screen.getByText('crd: 8')).toBeInTheDocument()
  })

  it('shows skeleton when loading', () => {
    vi.mocked(useGetJobsByTypeQuery).mockReturnValueOnce({
      isLoading: true,
      data: undefined
    } as unknown as ReturnType<typeof useGetJobsByTypeQuery>)
    renderWithProviders(<JobsByTypePie />)
    expect(screen.queryByText('pdb: 12')).not.toBeInTheDocument()
  })

  it('shows empty state when there are no jobs', () => {
    vi.mocked(useGetJobsByTypeQuery).mockReturnValueOnce({
      isLoading: false,
      data: []
    } as unknown as ReturnType<typeof useGetJobsByTypeQuery>)
    renderWithProviders(<JobsByTypePie />)
    expect(screen.getByText(/No jobs to display/i)).toBeInTheDocument()
  })
})
