import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import NewSANSJob from '../NewSANSJobForm'

vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewSANSJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ],
  useCalculateAutoRgMutation: () => [vi.fn(), { isLoading: false }]
}))
vi.mock('../../../slices/publicJobsApiSlice', () => ({
  useAddNewPublicSANSJobMutation: () => [
    vi
      .fn()
      .mockResolvedValue({ unwrap: vi.fn().mockResolvedValue({ id: '123' }) }),
    { isSuccess: false }
  ]
}))
vi.mock('../../../slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: { useNersc: 'false' }, isLoading: false })
}))

describe('NewSANSJobForm md_engine', () => {
  it('renders CHARMM and OpenMM options and defaults to CHARMM', async () => {
    render(<NewSANSJob />)
    const charmm = screen.getByLabelText(/CHARMM/i)
    const openmm = screen.getByLabelText(/OpenMM/i)
    expect(charmm).toBeInTheDocument()
    expect(openmm).toBeInTheDocument()
    expect((charmm as HTMLInputElement).checked).toBe(true)
  })

  // it('allows selecting OpenMM', async () => {
  //   const user = userEvent.setup()
  //   render(<NewSANSJob />)
  //   const openmm = screen.getByLabelText(/OpenMM/i)
  //   await user.click(openmm)
  //   expect((openmm as HTMLInputElement).checked).toBe(true)
  // })
})
