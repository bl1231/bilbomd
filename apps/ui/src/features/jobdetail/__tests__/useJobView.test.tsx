import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { setupStore } from 'app/store'
import {
  setJobEventsConnected,
  STREAM_FALLBACK_POLL_MS
} from 'slices/jobEventsSlice'
import { useGetJobByIdQuery, useGetMDMoviesQuery } from 'slices/jobsApiSlice'
import {
  useGetPublicJobByIdQuery,
  useGetPublicMDMoviesQuery
} from 'slices/publicJobsApiSlice'
import { usePublicJobEvents } from 'hooks/usePublicJobEvents'
import { jobPollingInterval, useJobView, useJobMovies } from '../useJobView'

vi.mock('slices/jobsApiSlice', () => ({
  useGetJobByIdQuery: vi.fn(),
  useGetMDMoviesQuery: vi.fn()
}))
vi.mock('slices/publicJobsApiSlice', () => ({
  useGetPublicJobByIdQuery: vi.fn(),
  useGetPublicMDMoviesQuery: vi.fn()
}))
vi.mock('hooks/usePublicJobEvents', () => ({ usePublicJobEvents: vi.fn() }))

const idle = { data: undefined, isLoading: false, isError: false }

const ownerDto = {
  id: 'job-1',
  username: 'alice',
  mongo: {
    id: 'job-1',
    jobType: 'pdb',
    uuid: 'u',
    status: 'Running',
    progress: 10,
    time_submitted: new Date()
  }
}

const publicDto = {
  publicId: 'tok',
  jobId: 'job-1',
  uuid: 'u',
  jobType: 'pdb',
  status: 'Completed',
  progress: 100,
  submittedAt: new Date()
}

const makeWrapper = (store = setupStore()) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return Wrapper
}

const lastOptions = (hook: unknown) =>
  vi.mocked(hook as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useGetJobByIdQuery).mockReturnValue(
    idle as unknown as ReturnType<typeof useGetJobByIdQuery>
  )
  vi.mocked(useGetPublicJobByIdQuery).mockReturnValue(
    idle as unknown as ReturnType<typeof useGetPublicJobByIdQuery>
  )
  vi.mocked(useGetMDMoviesQuery).mockReturnValue(
    idle as unknown as ReturnType<typeof useGetMDMoviesQuery>
  )
  vi.mocked(useGetPublicMDMoviesQuery).mockReturnValue(
    idle as unknown as ReturnType<typeof useGetPublicMDMoviesQuery>
  )
  vi.mocked(usePublicJobEvents).mockReturnValue(false)
})

describe('jobPollingInterval', () => {
  it('stops polling finished jobs', () => {
    expect(jobPollingInterval('Completed', false)).toBe(0)
    expect(jobPollingInterval('Failed', true)).toBe(0)
  })

  it('polls only as a safety net while the event stream is up', () => {
    expect(jobPollingInterval('Running', true)).toBe(STREAM_FALLBACK_POLL_MS)
  })

  it('polls running (or not yet loaded) jobs faster than queued ones', () => {
    expect(jobPollingInterval('Running', false)).toBe(10_000)
    expect(jobPollingInterval(undefined, false)).toBe(10_000)
    expect(jobPollingInterval('Pending', false)).toBe(30_000)
  })
})

describe('useJobView', () => {
  it('loads an owner job by id and skips the public query', () => {
    vi.mocked(useGetJobByIdQuery).mockReturnValue({
      ...idle,
      data: ownerDto
    } as unknown as ReturnType<typeof useGetJobByIdQuery>)

    const { result } = renderHook(
      () => useJobView({ kind: 'owner', id: 'job-1' }),
      { wrapper: makeWrapper() }
    )

    expect(vi.mocked(useGetJobByIdQuery).mock.calls.at(-1)?.[0]).toBe('job-1')
    expect(vi.mocked(useGetPublicJobByIdQuery).mock.calls.at(-1)?.[0]).toBe(
      skipToken
    )
    expect(usePublicJobEvents).toHaveBeenLastCalledWith(undefined)
    expect(result.current.view).toMatchObject({
      id: 'job-1',
      status: 'Running'
    })
  })

  it('uses the shared event stream state for owner jobs', () => {
    const store = setupStore()
    store.dispatch(setJobEventsConnected(true))
    vi.mocked(useGetJobByIdQuery).mockReturnValue({
      ...idle,
      data: ownerDto
    } as unknown as ReturnType<typeof useGetJobByIdQuery>)

    const { result } = renderHook(
      () => useJobView({ kind: 'owner', id: 'job-1' }),
      { wrapper: makeWrapper(store) }
    )

    expect(result.current.eventsConnected).toBe(true)
    expect(lastOptions(useGetJobByIdQuery)).toMatchObject({
      pollingInterval: STREAM_FALLBACK_POLL_MS
    })
  })

  it('loads a public job by token with its own event stream', () => {
    vi.mocked(useGetPublicJobByIdQuery).mockReturnValue({
      ...idle,
      data: publicDto
    } as unknown as ReturnType<typeof useGetPublicJobByIdQuery>)

    const { result } = renderHook(
      () => useJobView({ kind: 'public', token: 'tok' }),
      { wrapper: makeWrapper() }
    )

    expect(vi.mocked(useGetJobByIdQuery).mock.calls.at(-1)?.[0]).toBe(skipToken)
    expect(usePublicJobEvents).toHaveBeenLastCalledWith('tok')
    expect(result.current.view).toMatchObject({
      id: 'job-1',
      publicId: 'tok',
      status: 'Completed'
    })
    // Once the Completed status is known, polling stops
    expect(lastOptions(useGetPublicJobByIdQuery)).toMatchObject({
      pollingInterval: 0
    })
  })

  it('passes loading and error state through', () => {
    vi.mocked(useGetPublicJobByIdQuery).mockReturnValue({
      ...idle,
      isError: true,
      error: { status: 404 }
    } as unknown as ReturnType<typeof useGetPublicJobByIdQuery>)

    const { result } = renderHook(
      () => useJobView({ kind: 'public', token: 'nope' }),
      { wrapper: makeWrapper() }
    )

    expect(result.current.view).toBeUndefined()
    expect(result.current.isError).toBe(true)
  })
})

describe('useJobMovies', () => {
  it('queries the endpoint matching the source', () => {
    renderHook(() => useJobMovies({ kind: 'public', token: 'tok' }, false))

    expect(vi.mocked(useGetPublicMDMoviesQuery).mock.calls.at(-1)?.[0]).toBe(
      'tok'
    )
    expect(vi.mocked(useGetMDMoviesQuery).mock.calls.at(-1)?.[0]).toBe(
      skipToken
    )
    expect(lastOptions(useGetPublicMDMoviesQuery)).toMatchObject({
      pollingInterval: 15_000
    })
  })
})
