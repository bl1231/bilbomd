import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import NewScoperJobForm from '../NewScoperJobForm'
import { useGetQueueStateQuery } from 'features/bullmq/bullmqApiSlice'

vi.mock('slices/jobsApiSlice', () => ({
  useAddNewScoperJobMutation: () => [vi.fn(), { isSuccess: false }]
}))
vi.mock('slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [vi.fn(), { isSuccess: false }]
}))
vi.mock('features/bullmq/bullmqApiSlice', () => ({
  useGetQueueStateQuery: vi.fn()
}))

const queueWith = (scoperWorkers: number | undefined) =>
  vi.mocked(useGetQueueStateQuery).mockReturnValue({
    data:
      scoperWorkers === undefined
        ? undefined
        : {
            scoper: {
              active_count: 0,
              waiting_count: 0,
              worker_count: scoperWorkers
            }
          }
  } as unknown as ReturnType<typeof useGetQueueStateQuery>)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NewScoperJobForm worker warning', () => {
  it('warns before submitting when no SCOPER worker is running', () => {
    queueWith(0)

    renderWithProviders(<NewScoperJobForm />)

    expect(
      screen.getByText(/No SCOPER worker is running right now/)
    ).toBeInTheDocument()
  })

  it('says nothing when a worker is running', () => {
    queueWith(1)

    renderWithProviders(<NewScoperJobForm />)

    expect(screen.queryByText(/No SCOPER worker/)).not.toBeInTheDocument()
  })

  it('skips the check for anonymous visitors', () => {
    queueWith(undefined)

    renderWithProviders(<NewScoperJobForm mode="anonymous" />)

    expect(useGetQueueStateQuery).toHaveBeenCalledWith('queueList', {
      skip: true
    })
    expect(screen.queryByText(/No SCOPER worker/)).not.toBeInTheDocument()
  })
})
