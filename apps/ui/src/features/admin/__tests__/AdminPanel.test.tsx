import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/test-utils'
import AdminPanel from '../AdminPanel'

vi.mock('slices/adminApiSlice', async () => {
  const actual = await vi.importActual('slices/adminApiSlice')
  return {
    ...actual,
    useGetQueuesQuery: vi.fn(() => ({
      data: [
        {
          name: 'bilbomd',
          jobCounts: {
            active: 1,
            completed: 5,
            delayed: 0,
            failed: 0,
            prioritized: 0,
            waiting: 2,
            'waiting-children': 0
          },
          isPaused: false
        }
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

vi.mock('slices/configsApiSlice', async () => {
  const actual = await vi.importActual('slices/configsApiSlice')
  return {
    ...actual,
    useGetConfigsQuery: vi.fn(() => ({
      data: {
        tokenExpires: 900,
        useNersc: true,
        nerscProject: 'ABC123'
      },
      error: null,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn()
    }))
  }
})

// Mock analytics slice to ensure the dashboard renders without network calls
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
        totalJobsSubmitted: 25,
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
    useGetJobsByStatusQuery: vi.fn(() => ({
      data: [
        { status: 'Completed', count: 18 },
        { status: 'Failed', count: 2 }
      ],
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

describe('AdminPanel', () => {
  it('renders without crashing and shows section headings', () => {
    renderWithProviders(<AdminPanel />)

    expect(screen.getByText(/BullMQ Dashboard/i)).toBeInTheDocument()
    expect(screen.getByText(/BilboMD Analytics/i)).toBeInTheDocument()
    // expect(screen.getByText(/configuration/i)).toBeInTheDocument()
  })
})
