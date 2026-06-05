import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import NewAlphaFoldJob from '../NewAlphaFoldJobForm'

vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewAlphaFoldJobMutation: () => [
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
  useGetConfigsQuery: () => ({
    data: { useNersc: 'false', enableBilboMdAlphaFold: 'true' },
    isLoading: false
  })
}))

describe('NewAlphaFoldJobForm md_engine', () => {
  it('does not render engine selection radio buttons', () => {
    render(<NewAlphaFoldJob />)
    expect(screen.queryByLabelText(/CHARMM/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/OpenMM/i)).not.toBeInTheDocument()
  })
})
