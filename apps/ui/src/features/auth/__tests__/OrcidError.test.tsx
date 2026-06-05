import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import OrcidError from '../OrcidError'

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router'
  )
  return {
    ...actual,
    useNavigate: () => navigateMock
  }
})

const renderAt = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/auth/orcid-error${search}`]}>
      <OrcidError />
    </MemoryRouter>
  )

describe('OrcidError', () => {
  it('renders the friendly message for no_primary_verified', () => {
    renderAt('?reason=no_primary_verified')
    expect(
      screen.getByText(/does not have a primary, verified email/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument()
  })

  it('renders the friendly message for email_already_registered', () => {
    renderAt('?reason=email_already_registered')
    expect(
      screen.getByText(/contact a BilboMD administrator/i)
    ).toBeInTheDocument()
  })

  it('renders the friendly message for token_exchange', () => {
    renderAt('?reason=token_exchange')
    expect(
      screen.getByText(/could not verify the response from ORCID/i)
    ).toBeInTheDocument()
  })

  it('falls back to the raw reason when no friendly mapping exists', () => {
    renderAt('?reason=mystery_reason')
    expect(screen.getByText(/Reason:/)).toBeInTheDocument()
    expect(screen.getByText('mystery_reason')).toBeInTheDocument()
  })

  it('falls back to "unknown" when no reason query param is present', () => {
    renderAt('')
    expect(screen.getByText(/Reason:/)).toBeInTheDocument()
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })

  it('navigates home when the Return button is clicked', () => {
    navigateMock.mockClear()
    renderAt('?reason=no_primary_verified')
    fireEvent.click(screen.getByRole('button', { name: /Return to Home/i }))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })
})
