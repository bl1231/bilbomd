import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogOutDialog from '../LogOut'

const mockLogout = vi.fn()

vi.mock('hooks/useLogout', () => ({
  default: () => mockLogout
}))

describe('LogOutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing while closed', () => {
    render(
      <LogOutDialog
        open={false}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('Do you want to Logout?')).not.toBeInTheDocument()
  })

  it('closes and logs out on confirm', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <LogOutDialog
        open
        onClose={onClose}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(onClose).toHaveBeenCalled()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('only closes on Nevermind', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <LogOutDialog
        open
        onClose={onClose}
      />
    )
    await user.click(
      screen.getByRole('button', { name: 'Actually... Nevermind' })
    )
    expect(onClose).toHaveBeenCalled()
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
