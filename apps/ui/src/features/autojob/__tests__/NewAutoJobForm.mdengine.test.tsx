import { render, screen } from '@testing-library/react'
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
  it('does not render engine selection radio buttons', () => {
    render(<NewAutoJobForm />)
    expect(screen.queryByLabelText(/CHARMM/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/OpenMM/i)).not.toBeInTheDocument()
  })
})
