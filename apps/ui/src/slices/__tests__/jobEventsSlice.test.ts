import { describe, it, expect, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupApiStore } from '../../test/testUtils'
import { server } from '../../test/server'
import { jobsApiSlice } from '../jobsApiSlice'
import jobEventsReducer, {
  clearDeletePending,
  selectJobEventsConnected,
  selectPendingDeletes,
  setJobEventsConnected
} from '../jobEventsSlice'

afterEach(() => {
  server.resetHandlers()
})

describe('jobEventsSlice reducers', () => {
  it('tracks whether the event stream is connected', () => {
    const state = jobEventsReducer(undefined, setJobEventsConnected(true))

    expect(selectJobEventsConnected({ jobEvents: state })).toBe(true)
  })

  it('clears one pending delete', () => {
    const state = jobEventsReducer(
      { connected: false, pendingDeletes: ['a', 'b'] },
      clearDeletePending('a')
    )

    expect(selectPendingDeletes({ jobEvents: state })).toEqual(['b'])
  })
})

describe('pending deletes', () => {
  it('marks a job as pending once its deletion is accepted', async () => {
    const { store } = setupApiStore()

    await store.dispatch(
      jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
    )

    expect(selectPendingDeletes(store.getState())).toEqual(['job-123'])
  })

  it('does not mark the job when the delete request fails', async () => {
    server.use(
      http.delete('http://localhost:3003/api/v1/jobs/:id', () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 })
      )
    )
    const { store } = setupApiStore()

    await store.dispatch(
      jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
    )

    expect(selectPendingDeletes(store.getState())).toEqual([])
  })

  it('keeps the job pending while the job list still contains it', async () => {
    const { store } = setupApiStore()
    await store.dispatch(
      jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
    )

    // the default handler's list contains job-123
    await store.dispatch(
      jobsApiSlice.endpoints.getJobs.initiate('jobsList', {
        forceRefetch: true
      })
    )

    expect(selectPendingDeletes(store.getState())).toEqual(['job-123'])
  })

  it('stops tracking the job once a fresh job list no longer has it', async () => {
    const { store } = setupApiStore()
    await store.dispatch(
      jobsApiSlice.endpoints.deleteJob.initiate({ id: 'job-123' })
    )
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => HttpResponse.json([]))
    )

    await store.dispatch(
      jobsApiSlice.endpoints.getJobs.initiate('jobsList', {
        forceRefetch: true
      })
    )

    expect(selectPendingDeletes(store.getState())).toEqual([])
  })
})
