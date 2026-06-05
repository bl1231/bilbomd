import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const getConfigsMock = vi.fn()
vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: (...args: unknown[]) => getConfigsMock(...args)
}))

import LoginPage from '../Login'

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path='/login'
          element={<LoginPage />}
        />
        <Route
          path='/magicklink'
          element={<div>MagickLink page</div>}
        />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' }
  })
})

describe('LoginPage', () => {
  it('renders the official "Sign in with ORCID iD" button when ORCID is enabled', () => {
    getConfigsMock.mockReturnValue({
      data: { orcidAuthEnabled: 'true' },
      isLoading: false
    })

    renderLogin()

    expect(
      screen.getByRole('button', { name: /Sign in with ORCID iD/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Sign in with ORCID iD/i })
    ).toBeInTheDocument()
  })

  it('redirects to /magicklink when ORCID is disabled', () => {
    getConfigsMock.mockReturnValue({
      data: { orcidAuthEnabled: 'false' },
      isLoading: false
    })

    renderLogin()

    expect(screen.getByText('MagickLink page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign in/i })).toBeNull()
  })

  it('redirects when the orcidAuthEnabled flag is missing entirely', () => {
    getConfigsMock.mockReturnValue({ data: {}, isLoading: false })

    renderLogin()

    expect(screen.getByText('MagickLink page')).toBeInTheDocument()
  })

  it('renders nothing while configs are still loading', () => {
    getConfigsMock.mockReturnValue({ data: undefined, isLoading: true })

    const { container } = renderLogin()

    expect(container.firstChild).toBeNull()
  })
})
