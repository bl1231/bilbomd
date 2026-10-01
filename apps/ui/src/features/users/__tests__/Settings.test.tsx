import { screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import SettingsLayout from '../Settings'
import { renderWithProviders } from 'test/test-utils'
import useAuth from 'hooks/useAuth'

vi.mock('hooks/useAuth')

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => navigateMock }
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(useAuth as Mock).mockReturnValue({
    username: 'testuser',
    displayName: 'Test User',
    email: 'testuser@example.com',
    status: 'User'
  })
})

describe('SettingsLayout', () => {
  it('lists every settings section, including notifications', () => {
    renderWithProviders(<SettingsLayout />)

    for (const name of [
      'Profile',
      'Notifications',
      'Email',
      'API Tokens',
      'Delete account'
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('links Notifications to the path used in job emails', () => {
    renderWithProviders(<SettingsLayout />)

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(navigateMock).toHaveBeenCalledWith('/settings/preferences')
  })
})
