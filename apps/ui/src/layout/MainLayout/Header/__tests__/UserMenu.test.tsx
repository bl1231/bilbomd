import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '../UserMenu'
import { avatarColorFor, initialsFor } from '../avatar'

const mockNavigate = vi.fn()
const mockLogout = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate
}))

vi.mock('hooks/useLogout', () => ({
  default: () => mockLogout
}))

const renderMenu = () =>
  render(
    <UserMenu
      displayName="Jane Doe"
      username="jdoe"
      email="jane@example.org"
      role="Admin"
    />
  )

describe('initialsFor', () => {
  it.each([
    ['Jane Doe', 'JD'],
    ['jane.doe', 'JD'],
    ['jdoe', 'JD'],
    ['  ', '?']
  ])('%j → %s', (name, initials) => {
    expect(initialsFor(name)).toBe(initials)
  })
})

describe('avatarColorFor', () => {
  it('gives the same color for the same name', () => {
    expect(avatarColorFor('jdoe')).toBe(avatarColorFor('jdoe'))
    expect(avatarColorFor('jdoe')).toMatch(/^hsl\(\d+, 45%, 42%\)$/)
  })
})

describe('UserMenu', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mockLogout.mockClear()
  })

  it('shows who is signed in on the trigger', () => {
    renderMenu()
    const trigger = screen.getByRole('button', {
      name: 'Account: Jane Doe (Admin)'
    })
    expect(within(trigger).getByText('JD')).toBeInTheDocument()
    expect(within(trigger).getByText('Jane Doe')).toBeInTheDocument()
    expect(within(trigger).getByText('Admin')).toBeInTheDocument()
  })

  it('opens with the theme control, the signed-in email and the links', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /account/i }))

    const menu = screen.getByRole('menu')
    expect(
      within(menu).getByRole('group', { name: 'Color theme' })
    ).toBeInTheDocument()
    expect(
      within(menu).getByText('Signed in as jane@example.org')
    ).toBeInTheDocument()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['My Jobs', 'Dashboard', 'Settings', 'Log out'])
  })

  it.each([
    ['My Jobs', '/dashboard/jobs'],
    ['Dashboard', '/dashboard'],
    ['Settings', '/settings']
  ])('%s goes to %s', async (text, path) => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /account/i }))
    await user.click(screen.getByRole('menuitem', { name: text }))
    expect(mockNavigate).toHaveBeenCalledWith(path)
  })

  it('asks before logging out', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /account/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(screen.getByText('Do you want to Logout?')).toBeInTheDocument()
    expect(mockLogout).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('does not log out when the user changes their mind', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /account/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))
    await user.click(
      screen.getByRole('button', { name: 'Actually... Nevermind' })
    )
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
