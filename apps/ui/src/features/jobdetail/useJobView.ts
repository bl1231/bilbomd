import { useEffect, useMemo, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useAppSelector } from 'app/hooks'
import { useGetJobByIdQuery, useGetMDMoviesQuery } from 'slices/jobsApiSlice'
import {
  useGetPublicJobByIdQuery,
  useGetPublicMDMoviesQuery
} from 'slices/publicJobsApiSlice'
import {
  STREAM_FALLBACK_POLL_MS,
  selectJobEventsConnected
} from 'slices/jobEventsSlice'
import { usePublicJobEvents } from 'hooks/usePublicJobEvents'
import type { JobSource } from './jobSource'
import { fromPublicJob, toJobView } from './jobView'
import { isFinishedStatus } from './stepModel'

const RUNNING_POLL_MS = 10_000
const QUEUED_POLL_MS = 30_000
const MOVIES_POLL_MS = 15_000

// While the event stream is up it drives refreshes, so polling is only a
// safety net. Finished jobs don't poll at all.
export const jobPollingInterval = (
  status: string | undefined,
  eventsConnected: boolean
): number => {
  if (isFinishedStatus(status)) return 0
  if (eventsConnected) return STREAM_FALLBACK_POLL_MS
  return status === undefined || status === 'Running'
    ? RUNNING_POLL_MS
    : QUEUED_POLL_MS
}

// Owner pages share the app-wide job event stream (started by Prefetch);
// public pages open one for their token.
const useEventsConnected = (source: JobSource): boolean => {
  const ownerConnected = useAppSelector(selectJobEventsConnected)
  const publicConnected = usePublicJobEvents(
    source.kind === 'public' ? source.token : undefined
  )
  return source.kind === 'owner' ? ownerConnected : publicConnected
}

export const useJobView = (source: JobSource) => {
  const eventsConnected = useEventsConnected(source)
  // The polling rate depends on the job's status, which the query returns
  const [status, setStatus] = useState<string | undefined>()
  const pollingInterval = jobPollingInterval(status, eventsConnected)

  const ownerQuery = useGetJobByIdQuery(
    source.kind === 'owner' ? source.id : skipToken,
    { pollingInterval, refetchOnFocus: true, refetchOnMountOrArgChange: true }
  )
  const publicQuery = useGetPublicJobByIdQuery(
    source.kind === 'public' ? source.token : skipToken,
    { pollingInterval }
  )

  const ownerData = ownerQuery.data
  const publicData = publicQuery.data
  const view = useMemo(() => {
    if (source.kind === 'owner') {
      return ownerData ? toJobView(ownerData) : undefined
    }
    return publicData ? fromPublicJob(publicData) : undefined
  }, [source.kind, ownerData, publicData])

  useEffect(() => {
    setStatus(view?.status)
  }, [view?.status])

  const query = source.kind === 'owner' ? ownerQuery : publicQuery
  return {
    view,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    eventsConnected
  }
}

export const useJobMovies = (source: JobSource, eventsConnected: boolean) => {
  const options = {
    // Movie events drive refreshes while the stream is up
    pollingInterval: eventsConnected ? STREAM_FALLBACK_POLL_MS : MOVIES_POLL_MS,
    skipPollingIfUnfocused: true
  }
  const ownerQuery = useGetMDMoviesQuery(
    source.kind === 'owner' ? source.id : skipToken,
    options
  )
  const publicQuery = useGetPublicMDMoviesQuery(
    source.kind === 'public' ? source.token : skipToken,
    options
  )
  const query = source.kind === 'owner' ? ownerQuery : publicQuery
  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
