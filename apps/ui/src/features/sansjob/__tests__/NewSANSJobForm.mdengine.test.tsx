import { render, screen } from '@testing-library/react'
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
  it('does not render engine selection radio buttons', () => {
    render(<NewSANSJob />)
    expect(screen.queryByLabelText(/CHARMM/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/OpenMM/i)).not.toBeInTheDocument()
  })
})
