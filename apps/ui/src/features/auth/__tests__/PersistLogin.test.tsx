import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import PersistLogin from '../PersistLogin'
import usePersist from 'hooks/usePersist'
import { useRefreshMutation } from 'slices/authApiSlice'
import { setupStore } from 'app/store'

vi.mock('hooks/usePersist', () => ({ default: vi.fn() }))

vi.mock('slices/authApiSlice', () => ({
  useRefreshMutation: vi.fn()
}))

// Render Outlet as a sentinel
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>
  }
})

const mockUsePersist = vi.mocked(usePersist)
const mockUseRefreshMutation = vi.mocked(useRefreshMutation)

const baseRefreshState = {
  isUninitialized: true,
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: undefined,
  reset: vi.fn()
}

describe('PersistLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Outlet immediately when persist is false', () => {
    mockUsePersist.mockReturnValue([false, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      vi.fn(),
      baseRefreshState
    ] as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<PersistLogin />)

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders CircularProgress while refresh is loading', () => {
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) }),
      { ...baseRefreshState, isUninitialized: false, isLoading: true }
    ] as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<PersistLogin />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument()
  })

  it('renders error state with MagickLink and Home buttons on refresh failure', () => {
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      vi.fn().mockReturnValue({ unwrap: vi.fn().mockRejectedValue(new Error('Unauthorized')) }),
      {
        ...baseRefreshState,
        isUninitialized: false,
        isError: true,
        error: { status: 401, data: 'Unauthorized' }
      }
    ] as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<PersistLogin />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /request a new magicklink/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /head over to main page/i })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument()
  })

  it('renders Outlet when refresh succeeds', async () => {
    // refresh() must return an object with .unwrap() — that's the RTK mutation pattern
    const refreshFn = vi.fn().mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ accessToken: 'tok' })
    })

    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refreshFn,
      {
        ...baseRefreshState,
        isUninitialized: false,
        isSuccess: true
      }
    ] as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<PersistLogin />)

    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument()
    })
  })

  it('renders Outlet when token already exists and mutation is uninitialized', () => {
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      vi.fn(),
      { ...baseRefreshState, isUninitialized: true }
    ] as ReturnType<typeof useRefreshMutation>)

    // Pre-populate store with an existing token
    const store = setupStore({ auth: { token: 'existing-token' } })
    renderWithProviders(<PersistLogin />, { store })

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
