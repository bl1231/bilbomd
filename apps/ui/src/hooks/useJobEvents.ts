import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { JobEvent } from '@bilbomd/bilbomd-types'
import { apiSlice, baseURL, refreshAccessToken } from 'app/api/apiSlice'
import { useAppDispatch } from 'app/hooks'
import { selectCurrentToken } from 'slices/authSlice'
import {
  clearDeletePending,
  setJobEventsConnected
} from 'slices/jobEventsSlice'
import { runJobEventStream } from 'utils/jobEventStream'

// Keeps RTK Query's job cache fresh from the backend's job event stream
// (GET /jobs/events). Events only name the job that changed; this hook
// invalidates the matching tags (see tagsForEvent) and RTK Query refetches
// whatever is mounted: the job's page, its movies, and the job list, which
// provides every listed job's tag. Mount once for the logged-in app.

// Changes are collected and invalidated together, so a burst of events
// costs one job-list refetch rather than one per event
export const INVALIDATE_BATCH_MS = 1500

type InvalidatedTag = { type: 'Job' | 'MovieAsset'; id: string }

// Which cached data an event makes stale
export const tagsForEvent = (event: JobEvent): InvalidatedTag[] => {
  switch (event.kind) {
    case 'created':
      // A new job isn't in any cached list yet, so its own tag wouldn't
      // reach the list; refetch the list itself
      return [{ type: 'Job', id: 'LIST' }]
    case 'movies':
      return [{ type: 'MovieAsset', id: event.jobId }]
    default:
      // updated, deleted, delete_failed
      return [{ type: 'Job', id: event.jobId }]
  }
}

export const createInvalidationBatcher = <
  Tag extends { type: string; id: string }
>(
  flush: (tags: Tag[]) => void,
  delayMs = INVALIDATE_BATCH_MS
) => {
  const tags = new Map<string, Tag>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    add: (newTags: Tag[]) => {
      for (const tag of newTags) tags.set(`${tag.type}:${tag.id}`, tag)
      timer ??= setTimeout(() => {
        const batch = [...tags.values()]
        tags.clear()
        timer = undefined
        flush(batch)
      }, delayMs)
    },
    cancel: () => {
      clearTimeout(timer)
      timer = undefined
      tags.clear()
    }
  }
}

export const useJobEvents = (): void => {
  const token = useSelector(selectCurrentToken)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    const batcher = createInvalidationBatcher<InvalidatedTag>((tags) =>
      dispatch(apiSlice.util.invalidateTags(tags))
    )

    const handleEvent = (event: JobEvent) => {
      // The job is still there: stop showing it as being deleted
      if (event.kind === 'delete_failed') {
        dispatch(clearDeletePending(event.jobId))
      }
      batcher.add(tagsForEvent(event))
    }

    void runJobEventStream({
      url: `${baseURL}/jobs/events`,
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      onEvent: handleEvent,
      onConnection: (connected, resumed) => {
        dispatch(setJobEventsConnected(connected))
        // Catch up on anything that changed while we were disconnected
        if (resumed) {
          dispatch(apiSlice.util.invalidateTags([{ type: 'Job', id: 'LIST' }]))
        }
      },
      // A new token re-runs this effect and reconnects. Without one the
      // session is over, so the stream stops.
      onUnauthorized: async () => {
        await refreshAccessToken(dispatch)
      }
    })

    return () => {
      controller.abort()
      batcher.cancel()
      dispatch(setJobEventsConnected(false))
    }
  }, [token, dispatch])
}
