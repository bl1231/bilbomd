import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import SoftPersistLogin from '../SoftPersistLogin'
import usePersist from 'hooks/usePersist'
import { useRefreshMutation } from 'slices/authApiSlice'
import { setCredentials } from 'slices/authSlice'
import { setupStore } from 'app/store'

vi.mock('hooks/usePersist', () => ({ default: vi.fn() }))

vi.mock('slices/authApiSlice', () => ({
  useRefreshMutation: vi.fn()
}))

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

const mockRefresh = (unwrap: () => Promise<unknown>) =>
  vi.fn().mockReturnValue({ unwrap })

describe('SoftPersistLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Outlet without refreshing when persist is false', () => {
    const refresh = mockRefresh(() => Promise.resolve({}))
    mockUsePersist.mockReturnValue([false, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      baseRefreshState
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<SoftPersistLogin />)

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders Outlet without refreshing when a token already exists', () => {
    const refresh = mockRefresh(() => Promise.resolve({}))
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      baseRefreshState
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    const store = setupStore()
    store.dispatch(setCredentials({ accessToken: 'existing-token' }))
    renderWithProviders(<SoftPersistLogin />, { store })

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a spinner and refreshes when persist is set but no token', async () => {
    const refresh = mockRefresh(() => new Promise(() => {}))
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      baseRefreshState
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<SoftPersistLogin />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument()
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('renders Outlet (no error screen) when the refresh fails', () => {
    const refresh = mockRefresh(() => Promise.reject(new Error('401')))
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      {
        ...baseRefreshState,
        isUninitialized: false,
        isError: true,
        error: { status: 401 }
      }
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderWithProviders(<SoftPersistLogin />)

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument()
  })
})
