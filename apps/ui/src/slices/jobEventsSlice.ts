import {
  createSlice,
  isFulfilled,
  PayloadAction,
  type EntityId,
  type UnknownAction
} from '@reduxjs/toolkit'
import { apiSlice } from 'app/api/apiSlice'

// State for the live job-event stream (see hooks/useJobEvents):
// - connected: pages poll only as a slow fallback while the stream is up
// - pendingDeletes: jobs whose deletion was accepted (202) but not yet
//   confirmed. The Jobs list shows them as "Deleting" until they drop out
//   of a fresh job list.
// How often pages still poll while the stream is connected, as a safety net
// for lost events
export const STREAM_FALLBACK_POLL_MS = 120_000

interface EndpointMeta<Args> {
  arg: { endpointName: string; originalArgs: Args }
}

// Matches a successful RTK Query call to one of apiSlice's endpoints. Uses
// the action's shape rather than jobsApiSlice's own matchers, so this slice
// (which every store includes) doesn't depend on jobsApiSlice, which many
// component tests mock.
const fulfilledFor =
  <Args, Payload>(endpointName: string) =>
  (
    action: UnknownAction
  ): action is PayloadAction<Payload, string, EndpointMeta<Args>> =>
    isFulfilled(action) &&
    action.type.startsWith(`${apiSlice.reducerPath}/`) &&
    (action.meta as Partial<EndpointMeta<Args>>).arg?.endpointName ===
      endpointName

interface JobEventsState {
  connected: boolean
  pendingDeletes: string[]
}

const initialState: JobEventsState = {
  connected: false,
  pendingDeletes: []
}

const jobEventsSlice = createSlice({
  name: 'jobEvents',
  initialState,
  reducers: {
    setJobEventsConnected: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload
    },
    clearDeletePending: (state, action: PayloadAction<string>) => {
      state.pendingDeletes = state.pendingDeletes.filter(
        (id) => id !== action.payload
      )
    }
  },
  extraReducers: (builder) => {
    // DELETE only queues the deletion (202), so the job is pending until
    // the server confirms it
    builder.addMatcher(
      fulfilledFor<{ id: string }, unknown>('deleteJob'),
      (state, action) => {
        const { id } = action.meta.arg.originalArgs
        if (!state.pendingDeletes.includes(id)) state.pendingDeletes.push(id)
      }
    )
    // A job whose deletion is pending is really gone once a fresh job list
    // no longer contains it
    builder.addMatcher(
      fulfilledFor<unknown, { ids: EntityId[] }>('getJobs'),
      (state, action) => {
        const ids = new Set(action.payload.ids.map(String))
        state.pendingDeletes = state.pendingDeletes.filter((id) => ids.has(id))
      }
    )
  }
})

export const { setJobEventsConnected, clearDeletePending } =
  jobEventsSlice.actions

export default jobEventsSlice.reducer

export const selectJobEventsConnected = (state: {
  jobEvents: JobEventsState
}) => state.jobEvents.connected

export const selectPendingDeletes = (state: { jobEvents: JobEventsState }) =>
  state.jobEvents.pendingDeletes
