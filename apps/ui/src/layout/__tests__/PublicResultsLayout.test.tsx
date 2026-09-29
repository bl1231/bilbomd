import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import useAuth from 'hooks/useAuth'
import PublicResultsLayout from '../PublicResultsLayout'

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))
vi.mock('layout/MainLayout', () => ({
  default: () => <div data-testid="main-layout" />
}))
vi.mock('layout/AnonLayout', () => ({
  default: () => <div data-testid="anon-layout" />
}))

const mockUseAuth = vi.mocked(useAuth)

describe('PublicResultsLayout', () => {
  it('uses the dashboard layout for logged-in users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true
    } as ReturnType<typeof useAuth>)

    render(<PublicResultsLayout />)

    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('uses the anonymous layout otherwise', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false
    } as ReturnType<typeof useAuth>)

    render(<PublicResultsLayout />)

    expect(screen.getByTestId('anon-layout')).toBeInTheDocument()
  })
})
