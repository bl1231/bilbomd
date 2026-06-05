import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import RequireAuth from '../RequireAuth'
import useAuth from 'hooks/useAuth'

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))

// Render Outlet content as a sentinel so we can assert it rendered
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Protected Content</div>,
    Navigate: ({ to, state }: { to: string; state?: unknown }) => (
      <div
        data-testid="navigate"
        data-to={to}
        data-state={JSON.stringify(state)}
      />
    )
  }
})

const mockUseAuth = vi.mocked(useAuth)

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Outlet when user has a matching role', () => {
    mockUseAuth.mockReturnValue({
      username: 'admin',
      displayName: 'admin',
      roles: ['Admin'],
      status: 'Admin',
      isManager: false,
      isAdmin: true,
      email: 'admin@example.com',
      isAuthenticated: true
    })

    renderWithProviders(<RequireAuth allowedRoles={['Admin']} />)

    expect(screen.getByTestId('outlet')).toBeInTheDocument()
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument()
  })

  it('renders Navigate when user has no matching role', () => {
    mockUseAuth.mockReturnValue({
      username: 'user',
      displayName: 'user',
      roles: ['User'],
      status: 'User',
      isManager: false,
      isAdmin: false,
      email: 'user@example.com',
      isAuthenticated: true
    })

    renderWithProviders(<RequireAuth allowedRoles={['Admin']} />)

    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument()
    const nav = screen.getByTestId('navigate')
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveAttribute('data-to', 'unauthorized')
  })

  it('passes location state to Navigate redirect', () => {
    mockUseAuth.mockReturnValue({
      username: 'user',
      displayName: 'user',
      roles: ['User'],
      status: 'User',
      isManager: false,
      isAdmin: false,
      email: 'user@example.com',
      isAuthenticated: true
    })

    renderWithProviders(<RequireAuth allowedRoles={['Manager', 'Admin']} />, {
      route: '/dashboard/admin'
    })

    const nav = screen.getByTestId('navigate')
    const state = JSON.parse(nav.getAttribute('data-state') || '{}')
    expect(state).toHaveProperty('from')
  })
})
