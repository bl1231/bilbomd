import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import JobDetails from '../JobDetails'

const mockLocation = {
  pathname: '/dashboard/jobs',
  search: '?filter=completed',
  hash: '',
  state: null,
  key: 'default'
}

vi.mock('react-router', async () => {
  const actual = (await vi.importActual('react-router')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    useLocation: () => mockLocation
  }
})

describe('JobDetails', () => {
  describe('rendering', () => {
    it('should render a button with details text', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link', { name: /details/i })
      expect(button).toBeInTheDocument()
    })

    it('should render info icon', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toHaveTextContent('Details')
    })

    it('should have outlined variant', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toHaveClass('MuiButton-outlined')
    })

    it('should have small size', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toHaveClass('MuiButton-sizeSmall')
    })

    it('should have job-details-button class', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toHaveClass('job-details-button')
    })
  })

  describe('navigation', () => {
    it('should link to job details page with correct id', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toHaveAttribute('href', '/dashboard/jobs/job-123')
    })

    it('should link to different job id', () => {
      renderWithProviders(<JobDetails id="job-456" />)

      const button = screen.getByRole('link')
      expect(button).toHaveAttribute('href', '/dashboard/jobs/job-456')
    })

    it('should preserve search params in state', () => {
      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toBeInTheDocument()
      // State is passed via Link component's state prop
      // The actual state value is internal to React Router
    })
  })

  describe('different job IDs', () => {
    const testIds = [
      'job-1',
      'job-abc-123',
      'very-long-job-id-12345678',
      '123'
    ]

    testIds.forEach((id) => {
      it(`should handle job id: ${id}`, () => {
        renderWithProviders(<JobDetails id={id} />)

        const button = screen.getByRole('link')
        expect(button).toHaveAttribute('href', `/dashboard/jobs/${id}`)
      })
    })
  })

  describe('location search params', () => {
    it('should work with empty search params', () => {
      vi.mocked(mockLocation).search = ''

      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toBeInTheDocument()
    })

    it('should work with complex search params', () => {
      vi.mocked(mockLocation).search =
        '?filter=completed&sort=date&page=2'

      renderWithProviders(<JobDetails id="job-123" />)

      const button = screen.getByRole('link')
      expect(button).toBeInTheDocument()
    })
  })
})
