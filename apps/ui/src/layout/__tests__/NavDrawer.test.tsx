import { render, screen, within, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { SubjectOutlined } from '@mui/icons-material'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import NavDrawer, { NavMenuItem } from '../NavDrawer'

const jobsOnClick = vi.fn()
const adminOnClick = vi.fn()
const onMobileClose = vi.fn()

const menuGroups: NavMenuItem[][] = [
  [
    {
      text: 'Jobs',
      icon: <SubjectOutlined />,
      path: '/dashboard/jobs',
      onclick: jobsOnClick,
      roles: ['user', 'manager']
    }
  ],
  [
    {
      text: 'Admin',
      icon: <AdminPanelSettingsIcon />,
      path: '/admin',
      onclick: adminOnClick,
      roles: ['admin']
    }
  ]
]

const renderNavDrawer = ({
  isAdmin = false,
  mobileOpen = false
}: { isAdmin?: boolean; mobileOpen?: boolean } = {}) =>
  render(
    <MemoryRouter initialEntries={['/dashboard/jobs']}>
      <NavDrawer
        menuGroups={menuGroups}
        isAdmin={isAdmin}
        mobileOpen={mobileOpen}
        onMobileClose={onMobileClose}
      />
    </MemoryRouter>
  )

// The temporary (mobile) drawer renders inside a Modal; the permanent
// (desktop) drawer does not. Use that to tell the two copies apart.
const getMobileDrawer = () => {
  const modal = document.querySelector('.MuiDrawer-modal')
  expect(modal).not.toBeNull()
  return within(modal as HTMLElement)
}

describe('NavDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders menu items in both the desktop and mobile drawers', () => {
    renderNavDrawer({ mobileOpen: true })
    expect(screen.getAllByText('Jobs')).toHaveLength(2)
  })

  it('navigates and closes the drawer when a mobile item is clicked', () => {
    renderNavDrawer({ mobileOpen: true })
    fireEvent.click(getMobileDrawer().getByText('Jobs'))
    expect(jobsOnClick).toHaveBeenCalledTimes(1)
    expect(onMobileClose).toHaveBeenCalledTimes(1)
  })

  it('navigates without closing when a desktop item is clicked', () => {
    renderNavDrawer({ mobileOpen: true })
    const desktopJobs = screen
      .getAllByText('Jobs')
      .find((el) => !el.closest('.MuiDrawer-modal'))
    expect(desktopJobs).toBeDefined()
    fireEvent.click(desktopJobs as HTMLElement)
    expect(jobsOnClick).toHaveBeenCalledTimes(1)
    expect(onMobileClose).not.toHaveBeenCalled()
  })

  it('hides admin-only items from non-admin users', () => {
    renderNavDrawer({ isAdmin: false })
    const adminButton = (screen.getAllByText('Admin')[0] as HTMLElement).closest(
      '.MuiListItemButton-root'
    )
    expect(adminButton).toHaveStyle({ display: 'none' })
  })

  it('shows admin-only items to admins', () => {
    renderNavDrawer({ isAdmin: true })
    const adminButton = (screen.getAllByText('Admin')[0] as HTMLElement).closest(
      '.MuiListItemButton-root'
    )
    expect(adminButton).not.toHaveStyle({ display: 'none' })
  })

  it('calls onMobileClose when the mobile drawer backdrop is clicked', () => {
    renderNavDrawer({ mobileOpen: true })
    const backdrop = document.querySelector('.MuiBackdrop-root')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop as HTMLElement)
    expect(onMobileClose).toHaveBeenCalledTimes(1)
  })
})
