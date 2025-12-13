import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import NewAutoJobForm from '../NewAutoJobForm'

vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewAutoJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ]
}))
vi.mock('../../../slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ]
}))
vi.mock('../../../slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: { useNersc: 'false' }, isLoading: false })
}))

describe('NewAutoJobForm md_engine', () => {
  it('renders CHARMM and OpenMM options and defaults to CHARMM', async () => {
    render(<NewAutoJobForm />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    const openmm = screen.getByLabelText(/OpenMM/i)
    expect(charmm).toBeInTheDocument()
    expect(openmm).toBeInTheDocument()
    expect((charmm as HTMLInputElement).checked).toBe(true)
  })

  it('allows selecting OpenMM', async () => {
    const user = userEvent.setup()
    render(<NewAutoJobForm />)
    const openmm = screen.getByLabelText(/OpenMM/i)
    await user.click(openmm)
    expect((openmm as HTMLInputElement).checked).toBe(true)
  })
})
