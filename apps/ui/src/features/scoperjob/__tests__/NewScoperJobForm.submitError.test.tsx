import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NewScoperJob from '../NewScoperJobForm'

const SAXS_MESSAGE =
  'SAXS data File contains 64 valid lines out of 64. We require at least 100 valid SAXS data lines with q, I(q), and error.'

const addNewScoperJob = vi.fn(() => ({
  unwrap: () =>
    Promise.reject({
      status: 400,
      data: {
        message: 'Validation failed',
        errors: [{ path: 'dat_file', message: SAXS_MESSAGE }]
      }
    })
}))

vi.mock('slices/jobsApiSlice', () => ({
  useAddNewScoperJobMutation: () => [addNewScoperJob, { isSuccess: false }]
}))
vi.mock('slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [vi.fn(), { isSuccess: false }]
}))
vi.mock('features/bullmq/bullmqApiSlice', () => ({
  useGetQueueStateQuery: () => ({ data: undefined, isError: false })
}))

describe('NewScoperJobForm submit errors', () => {
  it('shows the backend validation details, not just "Validation failed"', async () => {
    render(<NewScoperJob />)

    fireEvent.click(screen.getByRole('button', { name: /load example data/i }))
    const submit = screen.getByRole('button', { name: /submit/i })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    expect(await screen.findByText('Validation failed')).toBeInTheDocument()
    expect(screen.getByText(SAXS_MESSAGE)).toBeInTheDocument()
    expect(addNewScoperJob).toHaveBeenCalledTimes(1)
  })
})
