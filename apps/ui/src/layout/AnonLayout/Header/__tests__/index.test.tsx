import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Header from '../index'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import useAuth from 'hooks/useAuth'

vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: vi.fn()
}))

vi.mock('hooks/useAuth', () => ({
  default: vi.fn()
}))

vi.mock('components/NightModeToggle', () => ({
  default: () => null
}))

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  )
}))

type ConfigQueryResult = ReturnType<typeof useGetConfigsQuery>

const successState = {
  data: { useNersc: 'false', mode: 'development', deploySite: 'bl1231' },
  error: undefined,
  isLoading: false,
  isFetching: false,
  isSuccess: true,
  isError: false,
  isUninitialized: false,
  status: 'fulfilled',
  refetch: vi.fn()
} as unknown as ConfigQueryResult

const authState = (isAuthenticated: boolean) => ({
  username: isAuthenticated ? 'testUser' : '',
  displayName: isAuthenticated ? 'testUser' : '',
  status: isAuthenticated ? 'Active' : '',
  roles: isAuthenticated ? ['User'] : [],
  isManager: false,
  isAdmin: false,
  email: '',
  isAuthenticated
})

describe('AnonLayout Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useGetConfigsQuery).mockReturnValue(successState)
  })

  it('links the logo to /welcome for anonymous visitors', () => {
    vi.mocked(useAuth).mockReturnValue(authState(false))
    render(<Header />)
    expect(screen.getByText('BilboMD')).toHaveAttribute('href', '/welcome')
    expect(screen.getByText('anonymous')).toBeInTheDocument()
  })

  it('links the logo to /dashboard for logged-in users', () => {
    vi.mocked(useAuth).mockReturnValue(authState(true))
    render(<Header />)
    expect(screen.getByText('BilboMD')).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByText('anonymous')).not.toBeInTheDocument()
  })
})
