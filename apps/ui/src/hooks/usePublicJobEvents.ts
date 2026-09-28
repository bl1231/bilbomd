import { useEffect, useState } from 'react'
import type { JobEvent } from '@bilbomd/bilbomd-types'
import { apiSlice, baseURL } from 'app/api/apiSlice'
import { useAppDispatch } from 'app/hooks'
import { runJobEventStream } from 'utils/jobEventStream'
import { shareJobEventStream } from 'utils/sharedJobEventStream'
import { createInvalidationBatcher } from './useJobEvents'

// Keeps a public job page fresh from its job's event stream
// (GET /public/jobs/:publicId/events, no login). The public queries are
// cached by the token in the URL, so that's the id their tags use. Returns
// whether the stream is connected, so the page can poll less while it is.

type PublicTag = { type: 'PublicJob' | 'PublicMovieAsset'; id: string }

export const publicTagsForEvent = (
  event: JobEvent,
  publicId: string
): PublicTag[] =>
  event.kind === 'movies'
    ? [{ type: 'PublicMovieAsset', id: publicId }]
    : [{ type: 'PublicJob', id: publicId }]

export const usePublicJobEvents = (publicId: string | undefined): boolean => {
  const dispatch = useAppDispatch()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!publicId) return
    const controller = new AbortController()
    const batcher = createInvalidationBatcher<PublicTag>((tags) =>
      dispatch(apiSlice.util.invalidateTags(tags))
    )

    // One stream per browser for this job, shared by all its tabs
    shareJobEventStream({
      name: `bilbomd-public-job-events:${publicId}`,
      signal: controller.signal,
      onEvent: (event) => batcher.add(publicTagsForEvent(event, publicId)),
      onConnection: (isConnected, resumed) => {
        setConnected(isConnected)
        // Catch up on anything that changed while we were disconnected
        if (resumed) {
          dispatch(
            apiSlice.util.invalidateTags([{ type: 'PublicJob', id: publicId }])
          )
        }
      },
      open: (signal, onEvent, onConnection) =>
        runJobEventStream({
          url: `${baseURL}/public/jobs/${encodeURIComponent(publicId)}/events`,
          signal,
          onEvent,
          onConnection,
          // The job doesn't exist (or was deleted): nothing to stream
          stopOnStatus: [404]
        })
    })

    return () => {
      controller.abort()
      batcher.cancel()
      setConnected(false)
    }
  }, [publicId, dispatch])

  return connected
}
