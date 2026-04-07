import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/test-utils'
import AnalyticsDashboard from '../AnalyticsDashboard'

vi.mock('slices/analyticsApiSlice', async () => {
  const actual = await vi.importActual('slices/analyticsApiSlice')
  return {
    ...actual,
    useGetSummaryQuery: vi.fn(() => ({
      data: {
        users: 10,
        jobs: 20,
        multijobs: 5,
        jobsCompleted: 18,
        jobsFailed: 2,
        usagePerPipeline: [
          { pipeline: 'pdb', count: 12 },
          { pipeline: 'crd', count: 8 }
        ]
      },
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    })),
    useGetJobsTimeseriesQuery: vi.fn(() => ({
      data: [
        { day: '2025-12-10', count: 3 },
        { day: '2025-12-11', count: 4 },
        { day: '2025-12-12', count: 5 },
        { day: '2025-12-13', count: 2 },
        { day: '2025-12-14', count: 6 },
        { day: '2025-12-15', count: 1 },
        { day: '2025-12-16', count: 7 }
      ],
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    })),
    useGetUsageSuccessRateQuery: vi.fn(() => ({
      data: [
        { pipeline: 'pdb', successRate: 0.9, total: 10 },
        { pipeline: 'crd', successRate: 0.8, total: 8 }
      ],
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    })),
    useGetUsageDurationStatsQuery: vi.fn(() => ({
      data: [
        { pipeline: 'pdb', avgMs: 500, p50Ms: 400, p90Ms: 1200, count: 10 },
        { pipeline: 'crd', avgMs: 800, p50Ms: 700, p90Ms: 2000, count: 8 }
      ],
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    })),
    useGetUsageAccessModeSplitQuery: vi.fn(() => ({
      data: [
        { pipeline: 'pdb', access_mode: 'user', count: 9 },
        { pipeline: 'pdb', access_mode: 'anonymous', count: 1 },
        { pipeline: 'crd', access_mode: 'user', count: 6 },
        { pipeline: 'crd', access_mode: 'anonymous', count: 2 }
      ],
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    }))
  }
})

describe('AnalyticsDashboard', () => {
  it('renders headings and child components', () => {
    renderWithProviders(<AnalyticsDashboard />)

    // Headings
    expect(screen.getByText(/BilboMD Analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/Admin Analytics/i)).toBeInTheDocument()

    // KPI cards labels
    expect(screen.getByText(/Users/i)).toBeInTheDocument()
    expect(screen.getByText(/^Jobs$/i)).toBeInTheDocument()

    // Child component headings
    expect(screen.getByText(/Job Submissions \(Daily\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Success Rate by Pipeline/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Duration Statistics \(completed jobs\)/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Access Mode Split/i)).toBeInTheDocument()
  })
})
