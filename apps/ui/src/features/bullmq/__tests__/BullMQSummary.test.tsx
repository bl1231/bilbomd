import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import BullMQSummary from '../BullMQSummary'
import { useGetQueueStateQuery } from 'features/bullmq/bullmqApiSlice'

vi.mock('features/bullmq/bullmqApiSlice', () => ({
  useGetQueueStateQuery: vi.fn()
}))

const { configState } = vi.hoisted(() => ({
  configState: { enableBilboMdScoper: 'true' }
}))
vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: configState })
}))

const useGetQueueStateQueryMock = useGetQueueStateQuery as unknown as Mock

const queues = (bilbomdWorkers: number, scoperWorkers: number) =>
  useGetQueueStateQueryMock.mockReturnValue({
    data: {
      bilbomd: {
        active_count: 0,
        waiting_count: 0,
        worker_count: bilbomdWorkers
      },
      scoper: { active_count: 0, waiting_count: 1, worker_count: scoperWorkers }
    },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: undefined
  })

describe('BullMQSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configState.enableBilboMdScoper = 'true'
  })

  it('warns when no SCOPER worker is running', () => {
    queues(2, 0)

    render(<BullMQSummary />)

    expect(screen.getByText(/No SCOPER worker is running/)).toBeInTheDocument()
    expect(screen.queryByText(/No BilboMD worker/)).not.toBeInTheDocument()
  })

  it('does not warn about SCOPER when SCOPER is switched off', () => {
    configState.enableBilboMdScoper = 'false'
    queues(2, 0)

    render(<BullMQSummary />)

    expect(screen.queryByText(/No SCOPER worker/)).not.toBeInTheDocument()
  })

  it('warns when no BilboMD worker is running', () => {
    queues(0, 1)

    render(<BullMQSummary />)

    expect(screen.getByText(/No BilboMD worker is running/)).toBeInTheDocument()
  })

  it('renders both queues with their counts', () => {
    useGetQueueStateQueryMock.mockReturnValue({
      data: {
        bilbomd: { active_count: 1, waiting_count: 2, worker_count: 3 },
        scoper: { active_count: 4, waiting_count: 5, worker_count: 6 }
      },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: undefined
    })

    render(<BullMQSummary />)

    expect(screen.getByText('BilboMD Queue')).toBeInTheDocument()
    expect(screen.getByText('Scoper Queue')).toBeInTheDocument()
    expect(screen.getAllByText('Active')).toHaveLength(2)
    expect(screen.getAllByText('Queued:')).toHaveLength(2)
    expect(screen.getAllByText('Workers:')).toHaveLength(2)
    for (const count of ['1', '2', '3', '4', '5', '6']) {
      expect(screen.getByText(count)).toBeInTheDocument()
    }
  })

  it('renders an error alert when the query fails', () => {
    useGetQueueStateQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: { status: 500, data: 'boom' }
    })

    render(<BullMQSummary />)

    expect(
      screen.getByText(/Failed to load BullMQ Queue Status/i)
    ).toBeInTheDocument()
  })
})
