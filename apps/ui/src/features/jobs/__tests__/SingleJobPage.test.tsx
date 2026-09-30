import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import SingleJobPage from '../SingleJobPage'

const mockUseParams = vi.fn()
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof import('react-router')>()),
  useParams: () => mockUseParams()
}))
vi.mock('hooks/useTitle', () => ({ default: vi.fn() }))
vi.mock('features/jobdetail/JobDetailPage', () => ({
  default: ({ source }: { source: unknown }) => (
    <div data-testid="job-detail">{JSON.stringify(source)}</div>
  )
}))

beforeEach(() => {
  mockUseParams.mockReset()
})

describe('SingleJobPage', () => {
  it('shows the job page for the id in the URL', () => {
    mockUseParams.mockReturnValue({ id: 'job-1' })
    renderWithProviders(<SingleJobPage />)
    expect(screen.getByTestId('job-detail')).toHaveTextContent(
      '{"kind":"owner","id":"job-1"}'
    )
  })

  it('reports a missing id', () => {
    mockUseParams.mockReturnValue({})
    renderWithProviders(<SingleJobPage />)
    expect(screen.getByText(/No BilboMD Job with id/)).toBeInTheDocument()
  })
})
