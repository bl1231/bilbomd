import { screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import DeleteAccount from '../DeleteAccount'
import { renderWithProviders } from 'test/test-utils'
import useAuth from 'hooks/useAuth'
import useLogout from 'hooks/useLogout'
import { useDeleteUserByUserNameMutation } from '../../../slices/userAccountApiSlice'

vi.mock('hooks/useAuth')
vi.mock('hooks/useLogout')
vi.mock('../../../slices/userAccountApiSlice')

const deleteAccount = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(useAuth as Mock).mockReturnValue({ username: 'testuser' })
  ;(useLogout as Mock).mockReturnValue(vi.fn())
  ;(useDeleteUserByUserNameMutation as Mock).mockReturnValue([
    deleteAccount,
    { isLoading: false }
  ])
})

const confirmDelete = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete my account' })
  )
}

describe('DeleteAccount', () => {
  it('explains that job history is kept', () => {
    renderWithProviders(<DeleteAccount />)
    expect(screen.getByText(/keeps your job history/i)).toBeInTheDocument()
  })

  it('asks for confirmation before deleting', async () => {
    renderWithProviders(<DeleteAccount />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes the account once confirmed', async () => {
    deleteAccount.mockReturnValue({ unwrap: () => Promise.resolve() })
    renderWithProviders(<DeleteAccount />)

    await confirmDelete()

    expect(
      await screen.findByText(/Your account is deleted/i)
    ).toBeInTheDocument()
    expect(deleteAccount).toHaveBeenCalledWith('testuser')
  })

  it('shows why deletion was refused', async () => {
    deleteAccount.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { message: 'You have jobs that are still queued or running.' }
        })
    })
    renderWithProviders(<DeleteAccount />)

    await confirmDelete()

    expect(
      await screen.findByText('You have jobs that are still queued or running.')
    ).toBeInTheDocument()
  })
})
