import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import AppBreadcrumbs from '../Breadcrumbs'
import { selectJobById } from 'slices/jobsApiSlice'
import { selectUserById } from 'slices/usersApiSlice'

vi.mock('slices/jobsApiSlice', () => ({
  selectJobById: vi.fn()
}))

vi.mock('slices/usersApiSlice', () => ({
  selectUserById: vi.fn()
}))

const mockSelectJobById = vi.mocked(selectJobById)
const mockSelectUserById = vi.mocked(selectUserById)

describe('AppBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectJobById.mockReturnValue(undefined)
    mockSelectUserById.mockReturnValue(undefined)
  })

  it('renders a static Home link plus mapped segment labels', () => {
    renderWithProviders(<AppBreadcrumbs />, { route: '/dashboard/jobs' })

    // Static home link is always present
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()

    // Intermediate segment renders as a link
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()

    // Last segment renders as non-linked text
    expect(screen.getByText('Jobs')).toBeInTheDocument()
    // Ensure "Jobs" is not a link
    const jobsLinks = screen
      .getAllByRole('link')
      .filter((el) => el.textContent === 'Jobs')
    expect(jobsLinks).toHaveLength(0)
  })

  it('filters out the welcome segment when it is the first path part', () => {
    renderWithProviders(<AppBreadcrumbs />, { route: '/welcome/dashboard' })

    // The word "welcome" should not appear as a mapped breadcrumb label
    const links = screen.getAllByRole('link')
    const linkTexts = links.map((l) => l.textContent)
    expect(linkTexts).not.toContain('welcome')

    // Dashboard should still appear (either as link or text)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows job title for job ID segment when parent is "jobs"', () => {
    mockSelectJobById.mockReturnValue({
      id: 'abc123',
      username: 'testuser',
      mongo: {
        id: 'abc123',
        title: 'My SAXS Job'
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    renderWithProviders(<AppBreadcrumbs />, {
      route: '/dashboard/jobs/abc123'
    })

    // Last crumb should show the job title, not the raw ID
    expect(screen.getByText('My SAXS Job')).toBeInTheDocument()
    expect(screen.queryByText('abc123')).not.toBeInTheDocument()
  })

  it('shows username for user ID segment when parent is "users"', () => {
    mockSelectUserById.mockReturnValue({
      id: 'user456',
      username: 'johndoe',
      roles: ['User'],
      active: true,
      email: 'john@example.com'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    renderWithProviders(<AppBreadcrumbs />, {
      route: '/admin/users/user456'
    })

    expect(screen.getByText('johndoe')).toBeInTheDocument()
    expect(screen.queryByText('user456')).not.toBeInTheDocument()
  })

  it('falls back to the segment text for unknown path segments', () => {
    renderWithProviders(<AppBreadcrumbs />, {
      route: '/tools/foobar'
    })

    // 'tools' has no labelMap entry → rendered as its raw text
    expect(screen.getByRole('link', { name: 'tools' })).toBeInTheDocument()
    // 'foobar' is the last segment, rendered as non-linked text
    expect(screen.getByText('foobar')).toBeInTheDocument()
  })
})
