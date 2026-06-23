import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import Prefetch from '../Prefetch'
import useAuth from 'hooks/useAuth'
import { useAppDispatch } from 'app/hooks'
import type { AppDispatch } from 'app/store'
import { jobsApiSlice } from 'slices/jobsApiSlice'
import { usersApiSlice } from 'slices/usersApiSlice'
import { configApiSlice } from 'slices/configsApiSlice'
import { bullmqApiSlice } from 'features/bullmq/bullmqApiSlice'

vi.mock('hooks/useAuth', () => ({ default: vi.fn() }))
vi.mock('app/hooks', () => ({ useAppDispatch: vi.fn() }))
vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />
}))

// Tag each prefetch call so we can identify what was dispatched
vi.mock('slices/configsApiSlice', () => ({
  configApiSlice: { util: { prefetch: vi.fn(() => ({ type: 'configs' })) } }
}))
vi.mock('slices/jobsApiSlice', () => ({
  jobsApiSlice: { util: { prefetch: vi.fn(() => ({ type: 'jobs' })) } }
}))
vi.mock('slices/usersApiSlice', () => ({
  usersApiSlice: { util: { prefetch: vi.fn(() => ({ type: 'users' })) } }
}))
vi.mock('features/bullmq/bullmqApiSlice', () => ({
  bullmqApiSlice: { util: { prefetch: vi.fn(() => ({ type: 'queue' })) } }
}))

const mockUseAuth = vi.mocked(useAuth)
const mockUseAppDispatch = vi.mocked(useAppDispatch)

const authState = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => ({
  username: 'user',
  displayName: 'user',
  roles: ['User'],
  status: 'User',
  isManager: false,
  isAdmin: false,
  email: 'user@example.com',
  isAuthenticated: true,
  ...overrides
})

describe('Prefetch', () => {
  let dispatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    dispatch = vi.fn()
    mockUseAppDispatch.mockReturnValue(dispatch as unknown as AppDispatch)
  })

  it('prefetches configs, jobs and queue for a plain User but not users', () => {
    mockUseAuth.mockReturnValue(authState())

    render(<Prefetch />)

    const dispatched = dispatch.mock.calls.map(([action]) => action.type)
    expect(dispatched).toContain('configs')
    expect(dispatched).toContain('jobs')
    expect(dispatched).toContain('queue')
    expect(dispatched).not.toContain('users')
    expect(usersApiSlice.util.prefetch).not.toHaveBeenCalled()
  })

  it('also prefetches users for a Manager', () => {
    mockUseAuth.mockReturnValue(
      authState({ roles: ['Manager'], status: 'Manager', isManager: true })
    )

    render(<Prefetch />)

    expect(dispatch.mock.calls.map(([a]) => a.type)).toContain('users')
    expect(usersApiSlice.util.prefetch).toHaveBeenCalledWith(
      'getUsers',
      'usersList',
      { force: true }
    )
  })

  it('also prefetches users for an Admin', () => {
    mockUseAuth.mockReturnValue(
      authState({ roles: ['Admin'], status: 'Admin', isAdmin: true })
    )

    render(<Prefetch />)

    expect(dispatch.mock.calls.map(([a]) => a.type)).toContain('users')
  })

  it('dispatches all prefetches into the real app store via useAppDispatch', () => {
    mockUseAuth.mockReturnValue(authState())

    render(<Prefetch />)

    // Sanity: it uses the shared typed dispatch, not a throw-away store
    expect(mockUseAppDispatch).toHaveBeenCalled()
    expect(configApiSlice.util.prefetch).toHaveBeenCalledWith(
      'getConfigs',
      'configData',
      { force: true }
    )
    expect(jobsApiSlice.util.prefetch).toHaveBeenCalledWith(
      'getJobs',
      'jobsList',
      { force: true }
    )
    expect(bullmqApiSlice.util.prefetch).toHaveBeenCalledWith(
      'getQueueState',
      'queueList',
      { force: true }
    )
  })
})
