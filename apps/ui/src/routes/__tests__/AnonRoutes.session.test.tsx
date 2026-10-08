import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AnonRoutes } from '../AnonRoutes'
import { setupStore } from 'app/store'
import { setCredentials } from 'slices/authSlice'
import usePersist from 'hooks/usePersist'
import { useRefreshMutation } from 'slices/authApiSlice'

// Routed behaviour test: SoftPersistLogin, PublicLayout, useAuth and the
// Redux store are all real. Only the network call and the two chrome
// layouts are stubbed, so this proves a restored session on a public URL
// actually yields the dashboard chrome.

vi.mock('hooks/usePersist', () => ({ default: vi.fn() }))

vi.mock('slices/authApiSlice', () => ({
  useRefreshMutation: vi.fn()
}))

vi.mock('layout/MainLayout', () => ({
  default: () => <div data-testid="main-layout">dashboard chrome</div>
}))

vi.mock('layout/AnonLayout', () => ({
  default: () => <div data-testid="anon-layout">Register / Login</div>
}))

const mockUsePersist = vi.mocked(usePersist)
const mockUseRefreshMutation = vi.mocked(useRefreshMutation)

const base64url = (value: object) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

// useAuth decodes the access token with jwt-decode, which does not verify
// the signature, so an unsigned token with the expected claims is enough.
const fakeAccessToken = [
  base64url({ alg: 'none', typ: 'JWT' }),
  base64url({
    UserInfo: {
      username: 'scott',
      displayName: 'Scott',
      roles: ['User'],
      email: 'scott@example.com'
    }
  }),
  ''
].join('.')

const idleRefreshState = {
  isUninitialized: true,
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: undefined,
  reset: vi.fn()
}

const renderPublicUrl = (path: string, store = setupStore()) => {
  const router = createMemoryRouter([AnonRoutes], { initialEntries: [path] })
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  )
  return { router, store }
}

describe('AnonRoutes session restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the anonymous chrome for a first-time visitor without calling refresh', () => {
    const refresh = vi.fn()
    mockUsePersist.mockReturnValue([false, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      idleRefreshState
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderPublicUrl('/help')

    expect(screen.getByTestId('anon-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('main-layout')).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('gives a returning logged-in user the dashboard chrome on a cold public URL', async () => {
    const store = setupStore()
    // Simulate the refresh endpoint succeeding: the real mutation's
    // onQueryStarted dispatches setCredentials with the new access token.
    const refresh = vi.fn().mockImplementation(() => ({
      unwrap: () => {
        store.dispatch(setCredentials({ accessToken: fakeAccessToken }))
        return Promise.resolve({ accessToken: fakeAccessToken })
      }
    }))
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      idleRefreshState
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderPublicUrl('/help', store)

    await waitFor(() =>
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    )
    expect(screen.queryByTestId('anon-layout')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('falls back to the anonymous chrome when the refresh cookie is expired', async () => {
    const refresh = vi.fn().mockReturnValue({
      unwrap: () => Promise.reject(new Error('401'))
    })
    mockUsePersist.mockReturnValue([true, vi.fn()])
    mockUseRefreshMutation.mockReturnValue([
      refresh,
      {
        ...idleRefreshState,
        isUninitialized: false,
        isError: true,
        error: { status: 401 }
      }
    ] as unknown as ReturnType<typeof useRefreshMutation>)

    renderPublicUrl('/about')

    await waitFor(() =>
      expect(screen.getByTestId('anon-layout')).toBeInTheDocument()
    )
    expect(screen.queryByTestId('main-layout')).not.toBeInTheDocument()
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument()
  })
})
