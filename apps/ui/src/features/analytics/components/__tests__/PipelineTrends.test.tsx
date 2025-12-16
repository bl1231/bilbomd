import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/test-utils'
import userEvent from '@testing-library/user-event'
import { PipelineTrends } from '../PipelineTrends'

// Mock the analytics API slice hook
vi.mock('../../../../slices/analyticsApiSlice', () => {
  const makeData = () =>
    Array.from({ length: 30 }).map((_, i) => ({
      day: `2025-01-${String(i + 1).padStart(2, '0')}`,
      count: i + 1
    }))
  return {
    useGetJobsTimeseriesQuery: vi.fn(() => ({
      data: makeData(),
      isLoading: false
    }))
  }
})
import { useGetJobsTimeseriesQuery } from '../../../../slices/analyticsApiSlice'

describe('PipelineTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows last 7 rows by default (Daily)', async () => {
    renderWithProviders(<PipelineTrends />)
    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(tbody.querySelectorAll('tr').length).toBe(7)
    expect(screen.getByText(/Job Submissions \(Daily\)/i)).toBeInTheDocument()
  })

  it('switches to Weekly and shows last 8 rows', async () => {
    renderWithProviders(<PipelineTrends />)
    await userEvent.click(screen.getByLabelText(/Weekly/i))
    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(tbody.querySelectorAll('tr').length).toBe(8)
    expect(screen.getByText(/Job Submissions \(Weekly\)/i)).toBeInTheDocument()
  })

  it('switches to Monthly and shows last 12 rows', async () => {
    renderWithProviders(<PipelineTrends />)
    await userEvent.click(screen.getByLabelText(/Monthly/i))
    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(tbody.querySelectorAll('tr').length).toBe(12)
    expect(screen.getByText(/Job Submissions \(Monthly\)/i)).toBeInTheDocument()
  })
})
