import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { finalizeMock, getSessionMock } = vi.hoisted(() => ({
  finalizeMock: vi.fn(),
  getSessionMock: vi.fn()
}))

vi.mock('../../../slices/authApiSlice', () => ({
  useGetOrcidSessionQuery: getSessionMock,
  useFinalizeOrcidMutation: () => [finalizeMock, { isLoading: false }]
}))

import OrcidConfirmation from '../OrcidConfirmation'

const sampleProfile = {
  givenName: 'Scott',
  familyName: 'Classen',
  email: 'scott@example.com',
  orcidId: '0000-0002-1234-5678'
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionMock.mockReturnValue({
    data: sampleProfile,
    isLoading: false,
    isError: false
  })
  finalizeMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) })
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' }
  })
})

describe('OrcidConfirmation', () => {
  it('renders read-only profile fields from the session', () => {
    render(<OrcidConfirmation />)

    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Classen')).toBeInTheDocument()
    expect(screen.getByText('scott@example.com')).toBeInTheDocument()
    expect(screen.getByText('0000-0002-1234-5678')).toBeInTheDocument()
  })

  it('surfaces the derived BilboMD display name and opaque account ID', () => {
    render(<OrcidConfirmation />)

    expect(screen.getByText('Scott Classen')).toBeInTheDocument()
    expect(screen.getByText('orcid-0000-0002-1234-5678')).toBeInTheDocument()
  })

  it('does NOT render any text inputs', () => {
    render(<OrcidConfirmation />)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('calls finalizeOrcid with an empty body when Confirm is clicked', async () => {
    render(<OrcidConfirmation />)

    fireEvent.click(
      screen.getByRole('button', { name: /Confirm and Continue/i })
    )

    await waitFor(() => expect(finalizeMock).toHaveBeenCalledWith({}))
    expect(window.location.href).toBe('/welcome')
  })

  it('redirects to the error page if finalize fails', async () => {
    finalizeMock.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('boom'))
    })

    render(<OrcidConfirmation />)
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm and Continue/i })
    )

    await waitFor(() =>
      expect(window.location.href).toBe('/auth/orcid-error?reason=finalize')
    )
  })
})
