import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import PublicJobSuccessAlert from '../PublicJobSuccessAlert'

// Mock useNavigate from react-router
const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = (await vi.importActual('react-router')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

// Mock CopyableChip so we can assert the permalink value appears
vi.mock('components/CopyableChip', () => ({
  default: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="copyable-chip">
      {label}:{value}
    </div>
  )
}))

describe('PublicJobSuccessAlert', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it('renders success title and job type with md_engine', () => {
    renderWithProviders(
      <PublicJobSuccessAlert
        jobType="auto"
        jobResponse={{
          publicId: 'pid-123',
          md_engine: 'OpenMM',
          resultUrl: 'https://example.com/results/pid-123'
        }}
      />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Job submitted!')).toBeInTheDocument()
    expect(screen.getByText(/BilboMD auto job/)).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      /will use\s+OpenMM\s+for the Molecular Dynamics step\./i
    )
  })

  it('renders permalink chip and navigates to results when clicking button', async () => {
    renderWithProviders(
      <PublicJobSuccessAlert
        jobType="auto"
        jobResponse={{
          publicId: 'pid-456',
          md_engine: 'CHARMM',
          resultUrl: 'https://host/results/pid-456'
        }}
      />
    )

    expect(
      screen.getByText('Please save this link to access your results later:')
    ).toBeInTheDocument()

    const chip = screen.getByTestId('copyable-chip')
    expect(chip).toHaveTextContent('Permalink:https://host/results/pid-456')

    const button = screen.getByRole('button')
    button.click()
    expect(mockNavigate).toHaveBeenCalledWith('/results/pid-456')
  })

  it('renders period when md_engine not provided', () => {
    renderWithProviders(
      <PublicJobSuccessAlert
        jobType="alphafold"
        jobResponse={{
          publicId: 'pid-789',
          resultUrl: 'https://host/results/pid-789'
        }}
      />
    )

    // Ensure the sentence ends with a period without the engine clause
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      /Your anonymous\s+BilboMD\s+alphafold\s+job\s+has been submitted\./i
    )
  })

  it('shows Results ID when no resultUrl is provided', () => {
    renderWithProviders(
      <PublicJobSuccessAlert
        jobType="scoper"
        jobResponse={{ publicId: 'only-id-001' }}
      />
    )

    expect(screen.getByText('Results ID: only-id-001')).toBeInTheDocument()
    // No permalink chip rendered in this case
    expect(screen.queryByTestId('copyable-chip')).toBeNull()
  })
})
