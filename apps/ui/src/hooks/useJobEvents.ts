import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { JOB_EVENT_SSE_NAME, type JobEvent } from '@bilbomd/bilbomd-types'
import { apiSlice, baseURL, refreshAccessToken } from 'app/api/apiSlice'
import { useAppDispatch } from 'app/hooks'
import { selectCurrentToken } from 'slices/authSlice'
import {
  clearDeletePending,
  setJobEventsConnected
} from 'slices/jobEventsSlice'
import { createSseParser } from 'utils/sse'
import { logger } from 'utils/logger'

// Keeps RTK Query's job cache fresh from the backend's job event stream
// (GET /jobs/events). Events only name the job that changed; this hook
// invalidates that job's 'Job' tag and RTK Query refetches whatever is
// mounted (the job's page, and the job list, which provides every job's tag).
// Mount once for the logged-in app.

// Changes are collected and invalidated together, so a burst of events
// costs one job-list refetch rather than one per event
export const INVALIDATE_BATCH_MS = 1500
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

export const reconnectDelay = (attempt: number): number =>
  Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)

export const createInvalidationBatcher = (
  flush: (jobIds: string[]) => void,
  delayMs = INVALIDATE_BATCH_MS
) => {
  const ids = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    add: (jobId: string) => {
      ids.add(jobId)
      timer ??= setTimeout(() => {
        const batch = [...ids]
        ids.clear()
        timer = undefined
        flush(batch)
      }, delayMs)
    },
    cancel: () => {
      clearTimeout(timer)
      timer = undefined
      ids.clear()
    }
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })

export const useJobEvents = (): void => {
  const token = useSelector(selectCurrentToken)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    const { signal } = controller

    const batcher = createInvalidationBatcher((jobIds) =>
      dispatch(
        apiSlice.util.invalidateTags(
          jobIds.map((id) => ({ type: 'Job' as const, id }))
        )
      )
    )

    const handleEvent = (event: JobEvent) => {
      // The job is still there: stop showing it as being deleted
      if (event.kind === 'delete_failed') {
        dispatch(clearDeletePending(event.jobId))
      }
      batcher.add(event.jobId)
    }

    const onSseEvent = ({ event, data }: { event: string; data: string }) => {
      if (event !== JOB_EVENT_SSE_NAME) return
      try {
        handleEvent(JSON.parse(data) as JobEvent)
      } catch {
        logger.warn('Ignoring malformed job event:', data)
      }
    }

    const run = async () => {
      let attempt = 0
      let connectedBefore = false
      while (!signal.aborted) {
        try {
          const res = await fetch(`${baseURL}/jobs/events`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream'
            },
            credentials: 'include',
            signal
          })
          if (res.status === 401 || res.status === 403) {
            // A new token re-runs this effect and reconnects. Without one
            // the session is over, so stop.
            await refreshAccessToken(dispatch)
            return
          }
          if (!res.ok || !res.body) {
            throw new Error(`Job event stream returned HTTP ${res.status}`)
          }

          dispatch(setJobEventsConnected(true))
          attempt = 0
          // Catch up on anything that changed while we were disconnected
          if (connectedBefore) {
            dispatch(
              apiSlice.util.invalidateTags([{ type: 'Job', id: 'LIST' }])
            )
          }
          connectedBefore = true

          // Fresh parser per connection, so a half-received event from a
          // dropped stream isn't glued onto the next one
          const parser = createSseParser(onSseEvent)
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            parser.push(decoder.decode(value, { stream: true }))
          }
        } catch (error) {
          if (signal.aborted) return
          logger.warn('Job event stream error:', error)
        }
        // The stream ended or failed: fall back to polling and retry
        dispatch(setJobEventsConnected(false))
        await sleep(reconnectDelay(attempt++), signal)
      }
    }
    void run()

    return () => {
      controller.abort()
      batcher.cancel()
      dispatch(setJobEventsConnected(false))
    }
  }, [token, dispatch])
}
