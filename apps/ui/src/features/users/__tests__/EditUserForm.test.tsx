import { renderWithProviders } from 'test/test-utils'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserDTO } from '@bilbomd/bilbomd-types'
import EditUserForm from '../EditUserForm'
import { getErrorMessage } from 'utils/apiError'
import {
  useUpdateUserMutation,
  useDeleteUserMutation
} from 'slices/usersApiSlice'
import useAuth from 'hooks/useAuth'

const enqueueSnackbar = vi.fn()
vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar })
}))

vi.mock('slices/usersApiSlice', () => ({
  useUpdateUserMutation: vi.fn(),
  useDeleteUserMutation: vi.fn()
}))

vi.mock('slices/jobsApiSlice', () => ({
  useGetJobsQuery: vi.fn(),
  selectAllJobs: () => []
}))

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))

const user: UserDTO = {
  id: 'u1',
  username: 'orcid-0000-0002-1234-5678',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  roles: ['User'],
  active: true,
  status: 'Active',
  jobCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z'
}

const updateUser = vi.fn()
const deleteUser = vi.fn()

const asAdmin = (username = 'scott') => {
  vi.mocked(useAuth).mockReturnValue({
    username,
    displayName: username,
    roles: ['Admin'],
    status: 'Admin',
    email: 'admin@example.com',
    isManager: false,
    isAdmin: true,
    isAuthenticated: true
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockReturnValue({ unwrap: () => Promise.resolve({}) })
  deleteUser.mockReturnValue({ unwrap: () => Promise.resolve() })
  vi.mocked(useUpdateUserMutation).mockReturnValue([
    updateUser,
    { isLoading: false }
  ] as unknown as ReturnType<typeof useUpdateUserMutation>)
  vi.mocked(useDeleteUserMutation).mockReturnValue([
    deleteUser,
    { isLoading: false }
  ] as unknown as ReturnType<typeof useDeleteUserMutation>)
  asAdmin()
})

describe('EditUserForm', () => {
  it('shows who is being edited and their ORCID', () => {
    renderWithProviders(<EditUserForm user={user} />)
    expect(
      screen.getByRole('heading', { name: 'Ada Lovelace' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '0000-0002-1234-5678' })
    ).toHaveAttribute('href', 'https://orcid.org/0000-0002-1234-5678')
  })

  it('keeps Save disabled until something changes, then submits', async () => {
    renderWithProviders(<EditUserForm user={user} />)
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Manager' }))
    expect(save).toBeEnabled()
    await userEvent.click(save)

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({
        id: 'u1',
        roles: ['User', 'Manager'],
        active: true,
        email: 'ada@example.com'
      })
    )
    expect(enqueueSnackbar).toHaveBeenCalledWith('Ada Lovelace updated', {
      variant: 'success'
    })
  })

  it('surfaces the API message when saving fails', async () => {
    updateUser.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 409, data: { message: 'Duplicate email' } })
    })
    renderWithProviders(<EditUserForm user={user} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Manager' }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith('Duplicate email', {
        variant: 'error'
      })
    )
  })

  it('locks access controls and delete when editing yourself', () => {
    asAdmin(user.username)
    renderWithProviders(<EditUserForm user={{ ...user, roles: ['Admin'] }} />)
    expect(screen.getByText('This is you')).toBeInTheDocument()
    expect(screen.getByLabelText('Active')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Manager' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'User' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled()
  })

  it('blocks delete for users who still have jobs', () => {
    renderWithProviders(<EditUserForm user={{ ...user, jobCount: 3 }} />)
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled()
    expect(
      screen.getByText(/users with jobs cannot be deleted/i)
    ).toBeInTheDocument()
  })

  it('deletes after confirmation and returns to the list', async () => {
    renderWithProviders(<EditUserForm user={user} />)
    await userEvent.click(screen.getByRole('button', { name: /delete user/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith({ id: 'u1' }))
    expect(enqueueSnackbar).toHaveBeenCalledWith('Ada Lovelace deleted', {
      variant: 'success'
    })
  })
})

describe('getErrorMessage', () => {
  it('prefers the API message, then the transport error, then the fallback', () => {
    expect(getErrorMessage({ data: { message: 'nope' } }, 'x')).toBe('nope')
    expect(getErrorMessage({ error: 'Network down' }, 'x')).toBe('Network down')
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
