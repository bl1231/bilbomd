import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import useAuth from 'hooks/useAuth'
import { useGetPublicJobByIdQuery } from 'slices/publicJobsApiSlice'
import { useGetJobByIdQuery } from 'slices/jobsApiSlice'
import PublicResultsPage from '../PublicResultsPage'

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))
vi.mock('slices/publicJobsApiSlice', () => ({
  useGetPublicJobByIdQuery: vi.fn()
}))
vi.mock('slices/jobsApiSlice', () => ({ useGetJobByIdQuery: vi.fn() }))
vi.mock('features/public/PublicJobPage', () => ({
  default: () => <div data-testid="public-job-page" />
}))

const mockUseAuth = vi.mocked(useAuth)
const mockPublicQuery = vi.mocked(useGetPublicJobByIdQuery)
const mockJobQuery = vi.mocked(useGetJobByIdQuery)

const setAuth = (isAuthenticated: boolean) =>
  mockUseAuth.mockReturnValue({ isAuthenticated } as ReturnType<typeof useAuth>)

const setPublic = (state: { data?: { jobId: string }; isLoading?: boolean }) =>
  mockPublicQuery.mockReturnValue({
    isLoading: false,
    ...state
  } as unknown as ReturnType<typeof useGetPublicJobByIdQuery>)

const setOwnership = (state: { isSuccess?: boolean; isFetching?: boolean }) =>
  mockJobQuery.mockReturnValue({
    isSuccess: false,
    isFetching: false,
    ...state
  } as unknown as ReturnType<typeof useGetJobByIdQuery>)

const renderAt = (path = '/results/tok-123') => {
  const router = createMemoryRouter(
    [
      { path: '/results/:publicId', element: <PublicResultsPage /> },
      {
        path: '/dashboard/jobs/:id',
        element: <div data-testid="dashboard-job-page" />
      }
    ],
    { initialEntries: [path] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('PublicResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the public page to anonymous visitors without extra queries', () => {
    setAuth(false)
    setPublic({})
    setOwnership({})

    renderAt()

    expect(screen.getByTestId('public-job-page')).toBeInTheDocument()
    expect(mockJobQuery).toHaveBeenCalledWith(expect.any(Symbol))
  })

  it('redirects a logged-in user who can open the job to the dashboard', () => {
    setAuth(true)
    setPublic({ data: { jobId: 'job-abc' } })
    setOwnership({ isSuccess: true })

    const router = renderAt()

    expect(screen.getByTestId('dashboard-job-page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard/jobs/job-abc')
    expect(mockJobQuery).toHaveBeenCalledWith('job-abc')
  })

  it('shows the public page to a logged-in user who does not own the job', () => {
    setAuth(true)
    setPublic({ data: { jobId: 'job-abc' } })
    setOwnership({ isSuccess: false })

    renderAt()

    expect(screen.getByTestId('public-job-page')).toBeInTheDocument()
  })

  it('shows a spinner while the ownership check runs', () => {
    setAuth(true)
    setPublic({ data: { jobId: 'job-abc' } })
    setOwnership({ isFetching: true })

    renderAt()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByTestId('public-job-page')).not.toBeInTheDocument()
  })
})
