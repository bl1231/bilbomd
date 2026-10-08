import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnonRoutes } from '../AnonRoutes'

vi.mock('components/Loadable', () => ({
  default: (Component: React.ComponentType) => Component
}))

vi.mock('features/auth/SoftPersistLogin', () => ({
  default: () => <div data-testid="soft-persist-login">SoftPersistLogin</div>
}))

vi.mock('features/auth/RedirectIfAuthenticated', () => ({
  // Children are lazy forms that would suspend; only the target matters here.
  default: ({ to }: { to: string }) => (
    <div
      data-testid="redirect-if-authenticated"
      data-to={to}
    />
  )
}))

vi.mock('layout/PublicLayout', () => ({
  default: () => <div data-testid="public-layout">PublicLayout</div>
}))

describe('AnonRoutes', () => {
  it('restores a persisted session before rendering any public page', () => {
    expect(AnonRoutes.path).toBe('/')
    render(AnonRoutes.element)
    expect(screen.getByTestId('soft-persist-login')).toBeInTheDocument()
  })

  it('nests the auth-aware public layout pathlessly under the session wrapper', () => {
    expect(AnonRoutes.children).toHaveLength(1)
    const layoutRoute = AnonRoutes.children[0]!
    expect(layoutRoute).not.toHaveProperty('path')
    render(layoutRoute.element)
    expect(screen.getByTestId('public-layout')).toBeInTheDocument()
  })

  it('keeps the public landing pages under the layout', () => {
    const paths = AnonRoutes.children[0]!.children.map((route) =>
      'index' in route ? 'index' : route.path
    )
    expect(paths).toEqual(
      expect.arrayContaining(['welcome', 'index', 'help', 'about'])
    )
  })

  it('sends logged-in users from every anonymous job form to its dashboard twin', () => {
    const jobFormRoutes = AnonRoutes.children[0]!.children.filter(
      (route) => 'path' in route && /^jobs\/.+\/new$/.test(route.path!)
    )
    expect(jobFormRoutes).toHaveLength(6)

    for (const route of jobFormRoutes) {
      const slug = route.path!.split('/')[1]
      const { unmount } = render(route.element)
      expect(screen.getByTestId('redirect-if-authenticated')).toHaveAttribute(
        'data-to',
        `/dashboard/jobs/${slug}`
      )
      unmount()
    }
  })
})
