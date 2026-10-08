import { renderWithProviders } from 'test/test-utils'
import { screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { UserDTO } from '@bilbomd/bilbomd-types'
import { useGetUsersQuery, selectAllUsers } from 'slices/usersApiSlice'
import UsersList from '../UsersList'

const mockUsers: UserDTO[] = [
  {
    id: '1',
    username: 'jdoe',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    roles: ['User'],
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    username: 'jsmith',
    email: 'jane@example.com',
    roles: ['Admin'],
    active: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
]

vi.mock('slices/usersApiSlice', () => ({
  useGetUsersQuery: vi.fn(),
  selectAllUsers: vi.fn()
}))

const mockQuery = (
  flags: Partial<ReturnType<typeof useGetUsersQuery>>,
  users: UserDTO[] = []
) => {
  vi.mocked(useGetUsersQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    refetch: vi.fn(),
    ...flags
  } as ReturnType<typeof useGetUsersQuery>)
  vi.mocked(selectAllUsers).mockReturnValue(users)
}

describe('UsersList', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a spinner while loading and keeps the header', () => {
    mockQuery({ isLoading: true })
    renderWithProviders(<UsersList />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it('shows an error alert when the fetch fails', () => {
    mockQuery({ isError: true })
    renderWithProviders(<UsersList />)
    expect(
      screen.getByText(/an error occurred while fetching users/i)
    ).toBeInTheDocument()
  })

  it('shows a neutral empty state', () => {
    mockQuery({ isSuccess: true })
    renderWithProviders(<UsersList />)
    expect(screen.getByText(/no users found/i)).toBeInTheDocument()
  })

  it('offers search and a count that hides inactive users by default', () => {
    mockQuery({ isSuccess: true }, mockUsers)
    renderWithProviders(<UsersList />)
    expect(screen.getByRole('textbox', { name: /search users/i })).toBeEnabled()
    expect(screen.getByText('1 of 2 users')).toBeInTheDocument()
    expect(screen.getByLabelText(/show inactive \(1\)/i)).not.toBeChecked()
  })
})
