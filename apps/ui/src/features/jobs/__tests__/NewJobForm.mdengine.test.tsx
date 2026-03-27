import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import NewJobForm from '../NewJobForm'

vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ],
  useCalculateAutoRgMutation: () => [vi.fn(), { isLoading: false }]
}))
vi.mock('../../../slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ]
}))
const mockUseGetConfigsQuery = vi.fn()
vi.mock('../../../slices/configsApiSlice', () => ({
  useGetConfigsQuery: (...args: unknown[]) => mockUseGetConfigsQuery(...args)
}))

describe('NewJobForm md_engine', () => {
  beforeEach(() => {
    mockUseGetConfigsQuery.mockReturnValue({
      data: { useNersc: 'false' },
      isLoading: false
    })
  })
  it('renders CHARMM and OpenMM options and defaults to CHARMM', async () => {
    render(<NewJobForm />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    const openmm = screen.getByLabelText(/OpenMM/i)
    expect(charmm).toBeInTheDocument()
    expect(openmm).toBeInTheDocument()
    expect((charmm as HTMLInputElement).checked).toBe(true)
  })

  it('allows selecting OpenMM', async () => {
    const user = userEvent.setup()
    render(<NewJobForm />)
    const openmm = screen.getByLabelText(/OpenMM/i)
    await user.click(openmm)
    expect((openmm as HTMLInputElement).checked).toBe(true)
  })

  it('disables CRD/PSF checkbox when CHARMM engine is disabled', () => {
    mockUseGetConfigsQuery.mockReturnValue({
      data: { useNersc: 'false', enableCharmmEngine: 'false' },
      isLoading: false
    })
    render(<NewJobForm />)
    const crdPsfCheckbox = screen.getByRole('checkbox', { name: /CRD\/PSF files/i })
    expect(crdPsfCheckbox).toBeDisabled()
  })

  it('CRD/PSF checkbox is enabled when CHARMM engine is enabled', () => {
    render(<NewJobForm />)
    const crdPsfCheckbox = screen.getByRole('checkbox', { name: /CRD\/PSF files/i })
    expect(crdPsfCheckbox).toBeEnabled()
  })
})
