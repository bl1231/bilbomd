import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import useAuth from 'hooks/useAuth'
import RedirectIfAuthenticated from '../RedirectIfAuthenticated'

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)

const renderAtAnonForm = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/jobs/classic/new',
        element: (
          <RedirectIfAuthenticated to="/dashboard/jobs/classic">
            <div>anonymous form</div>
          </RedirectIfAuthenticated>
        )
      },
      {
        path: '/dashboard/jobs/classic',
        element: <div>authenticated form</div>
      }
    ],
    { initialEntries: ['/jobs/classic/new'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('RedirectIfAuthenticated', () => {
  it('renders the anonymous page for logged-out visitors', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false
    } as ReturnType<typeof useAuth>)

    const router = renderAtAnonForm()

    expect(screen.getByText('anonymous form')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/jobs/classic/new')
  })

  it('replaces the anonymous URL with the authenticated one for logged-in users', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true
    } as ReturnType<typeof useAuth>)

    const router = renderAtAnonForm()

    expect(await screen.findByText('authenticated form')).toBeInTheDocument()
    expect(screen.queryByText('anonymous form')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard/jobs/classic')
    // replace, not push: back should not return to the anonymous form
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
