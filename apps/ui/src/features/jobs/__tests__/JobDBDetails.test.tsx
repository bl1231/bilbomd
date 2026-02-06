import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import JobDBDetails from '../JobDBDetails'
import { createMockBilboMDJob } from 'test/mockJob'
import { renderWithProviders } from 'test/rendersWithProviders'
import { useJobProperties } from '../../results/hooks/useJobProperties'

// Mock the hooks and components with simpler implementations
vi.mock('../../results/hooks/useJobProperties')

vi.mock('../results/components/FileModal', () => ({
  FileModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="file-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null
}))

vi.mock('components/CopyableChip', () => ({
  default: ({ label, value }: { label: string; value: string }) => (
    <div
      data-testid={`copyable-chip-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {label}: {value}
    </div>
  )
}))

vi.mock('slices/jobsApiSlice', () => ({
  useLazyGetFileByIdAndNameQuery: () => [
    vi.fn(),
    { data: null, isLoading: false, error: null }
  ]
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: vi.fn()
  })
}))

describe('JobDBDetails', () => {
  const mockUseJobProperties = vi.mocked(useJobProperties)

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock return value
    mockUseJobProperties.mockReturnValue([
      { label: 'Job Type', value: 'pdb' },
      { label: 'Status', value: 'Completed' },
      { label: 'Data File', value: 'example.dat' }
    ])
  })

  it('renders the Details accordion', () => {
    const job = createMockBilboMDJob()
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('renders UUID copyable chip', () => {
    const job = createMockBilboMDJob({
      mongo: { uuid: 'test-uuid-123' }
    })
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('UUID:')).toBeInTheDocument()
    expect(screen.getByTestId('copyable-chip-uuid')).toBeInTheDocument()
  })

  it('renders public UUID for anonymous jobs', () => {
    const job = createMockBilboMDJob({
      mongo: {
        access_mode: 'anonymous',
        public_id: 'public-123'
      }
    })
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('Public UUID:')).toBeInTheDocument()
    expect(screen.getByTestId('copyable-chip-public-uuid')).toBeInTheDocument()
  })

  it('does not render public UUID for user jobs', () => {
    const job = createMockBilboMDJob({
      mongo: {
        access_mode: 'user'
      }
    })
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.queryByText('Public UUID:')).not.toBeInTheDocument()
  })

  it('calls useJobProperties hook with correct parameters', () => {
    const job = createMockBilboMDJob()
    renderWithProviders(<JobDBDetails job={job} />)

    expect(mockUseJobProperties).toHaveBeenCalledWith(job, expect.any(Function))
  })

  it('renders properties from useJobProperties', () => {
    const mockProperties = [
      { label: 'Custom Property', value: 'Custom Value' },
      { label: 'Number Property', value: 42 }
    ]

    mockUseJobProperties.mockReturnValue(mockProperties)

    const job = createMockBilboMDJob()
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('Custom Property:')).toBeInTheDocument()
    expect(screen.getByText('Custom Value')).toBeInTheDocument()
    expect(screen.getByText('Number Property:')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders date properties correctly', () => {
    const testDate = new Date('2023-01-01T12:00:00Z')
    const mockProperties = [{ label: 'Date Property', value: testDate }]

    mockUseJobProperties.mockReturnValue(mockProperties)

    const job = createMockBilboMDJob()
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('Date Property:')).toBeInTheDocument()
  })

  it('renders custom render functions from properties', () => {
    const mockProperties = [
      {
        label: 'Custom Render',
        render: () => <span data-testid="custom-element">Custom Content</span>
      }
    ]

    mockUseJobProperties.mockReturnValue(mockProperties)

    const job = createMockBilboMDJob()
    renderWithProviders(<JobDBDetails job={job} />)

    expect(screen.getByText('Custom Render:')).toBeInTheDocument()
    expect(screen.getByTestId('custom-element')).toBeInTheDocument()
  })

  it('accordion is expanded by default for non-completed jobs', () => {
    const job = createMockBilboMDJob({
      mongo: { status: 'Running' }
    })
    renderWithProviders(<JobDBDetails job={job} />)

    const accordion = screen.getByRole('button', { expanded: true })
    expect(accordion).toBeInTheDocument()
  })

  it('accordion is collapsed by default for completed jobs', () => {
    const job = createMockBilboMDJob({
      mongo: { status: 'Completed' }
    })
    renderWithProviders(<JobDBDetails job={job} />)

    const accordion = screen.getByRole('button', { expanded: false })
    expect(accordion).toBeInTheDocument()
  })
})
