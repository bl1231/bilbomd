import { screen } from '@testing-library/react'
import { describe, it, expect, vi, Mock } from 'vitest'
import Profile from '../Profile'
import { renderWithProviders } from 'test/test-utils'
import useAuth from 'hooks/useAuth'

vi.mock('hooks/useAuth')

const mockUser = (username: string) =>
  (useAuth as Mock).mockReturnValue({
    username,
    displayName: 'Test User',
    email: 'testuser@example.com',
    roles: ['User', 'Manager']
  })

describe('Profile', () => {
  it('shows the name, email and roles', () => {
    mockUser('testuser')
    renderWithProviders(<Profile />)

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('testuser@example.com')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })

  it('shows emailed codes as the sign-in method for email accounts', () => {
    mockUser('testuser')
    renderWithProviders(<Profile />)

    expect(screen.getByText('Emailed sign-in code')).toBeInTheDocument()
  })

  it('links the ORCID iD for ORCID accounts', () => {
    mockUser('orcid-0000-0002-1234-5678')
    renderWithProviders(<Profile />)

    expect(
      screen.getByRole('link', { name: '0000-0002-1234-5678' })
    ).toHaveAttribute('href', 'https://orcid.org/0000-0002-1234-5678')
  })
})
