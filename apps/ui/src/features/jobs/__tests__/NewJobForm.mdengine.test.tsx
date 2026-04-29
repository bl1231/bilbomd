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

  it('renders CHARMM and OpenMM options and defaults to OpenMM', async () => {
    render(<NewJobForm />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    const openmm = screen.getByLabelText(/OpenMM/i)
    expect(charmm).toBeInTheDocument()
    expect(openmm).toBeInTheDocument()
    expect((openmm as HTMLInputElement).checked).toBe(true)
  })

  it('allows selecting CHARMM when enabled', async () => {
    const user = userEvent.setup()
    render(<NewJobForm />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    await user.click(charmm)
    expect((charmm as HTMLInputElement).checked).toBe(true)
  })

  it('disables CHARMM option when CHARMM engine is disabled', () => {
    mockUseGetConfigsQuery.mockReturnValue({
      data: { useNersc: 'false', enableCharmmEngine: 'false' },
      isLoading: false
    })
    render(<NewJobForm />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    expect(charmm).toBeDisabled()
  })

  it('does not render mode checkboxes', () => {
    render(<NewJobForm />)
    expect(
      screen.queryByRole('checkbox', { name: /PDB or CIF file/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: /CRD\/PSF files/i })
    ).not.toBeInTheDocument()
  })

  describe('engine-mode coupling: file inputs shown per engine', () => {
    it('shows PDB file upload by default (OpenMM)', () => {
      render(<NewJobForm />)
      expect(screen.getByText(/\*\.pdb or \*\.cif/i)).toBeInTheDocument()
    })

    it('does not show CRD or PSF file uploads by default (OpenMM)', () => {
      render(<NewJobForm />)
      expect(
        screen.queryByText(/CHARMM-GUI \*\.crd/i)
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(/CHARMM-GUI \*\.psf/i)
      ).not.toBeInTheDocument()
    })

    it('shows CRD file upload after selecting CHARMM engine', async () => {
      const user = userEvent.setup()
      render(<NewJobForm />)
      await user.click(screen.getByLabelText(/CHARMM/i))
      expect(screen.getByText(/CHARMM-GUI \*\.crd/i)).toBeInTheDocument()
    })

    it('shows PSF file upload after selecting CHARMM engine', async () => {
      const user = userEvent.setup()
      render(<NewJobForm />)
      await user.click(screen.getByLabelText(/CHARMM/i))
      expect(screen.getByText(/CHARMM-GUI \*\.psf/i)).toBeInTheDocument()
    })

    it('does not show PDB file upload after selecting CHARMM engine', async () => {
      const user = userEvent.setup()
      render(<NewJobForm />)
      await user.click(screen.getByLabelText(/CHARMM/i))
      expect(screen.queryByText(/\*\.pdb or \*\.cif/i)).not.toBeInTheDocument()
    })

    it('restores PDB file upload when switching back to OpenMM', async () => {
      const user = userEvent.setup()
      render(<NewJobForm />)
      await user.click(screen.getByLabelText(/CHARMM/i))
      await user.click(screen.getByLabelText(/OpenMM/i))
      expect(screen.getByText(/\*\.pdb or \*\.cif/i)).toBeInTheDocument()
      expect(
        screen.queryByText(/CHARMM-GUI \*\.crd/i)
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText(/CHARMM-GUI \*\.psf/i)
      ).not.toBeInTheDocument()
    })
  })
})
