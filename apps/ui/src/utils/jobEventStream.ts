import { JOB_EVENT_SSE_NAME, type JobEvent } from '@bilbomd/bilbomd-types'
import { createSseParser } from 'utils/sse'
import { logger } from 'utils/logger'

// Reads a job event stream (Server-Sent Events) with fetch, which, unlike
// EventSource, can send an Authorization header. Reconnects with backoff
// until the signal aborts. Used by useJobEvents (logged in) and
// usePublicJobEvents (a public job page).

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

export const reconnectDelay = (attempt: number): number =>
  Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)

export interface JobEventStreamOptions {
  url: string
  headers?: Record<string, string>
  signal: AbortSignal
  onEvent: (event: JobEvent) => void
  // true once the stream is up, false when it drops. resumed is true when
  // this connection follows an earlier one, so events may have been missed.
  onConnection: (connected: boolean, resumed: boolean) => void
  // On 401/403: called, then the stream stops (e.g. after a token refresh
  // that restarts it with the new token). Without it, 401/403 are retried.
  onUnauthorized?: () => Promise<void>
  // Statuses after which retrying is pointless (e.g. 404: the job is gone)
  stopOnStatus?: number[]
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

export const runJobEventStream = async ({
  url,
  headers,
  signal,
  onEvent,
  onConnection,
  onUnauthorized,
  stopOnStatus = []
}: JobEventStreamOptions): Promise<void> => {
  const onSseEvent = ({ event, data }: { event: string; data: string }) => {
    if (event !== JOB_EVENT_SSE_NAME) return
    try {
      onEvent(JSON.parse(data) as JobEvent)
    } catch {
      logger.warn('Ignoring malformed job event:', data)
    }
  }

  let attempt = 0
  let connectedBefore = false
  while (!signal.aborted) {
    try {
      const res = await fetch(url, {
        headers: { ...headers, Accept: 'text/event-stream' },
        credentials: 'include',
        signal
      })
      if (onUnauthorized && (res.status === 401 || res.status === 403)) {
        await onUnauthorized()
        return
      }
      if (stopOnStatus.includes(res.status)) return
      if (!res.ok || !res.body) {
        throw new Error(`Job event stream returned HTTP ${res.status}`)
      }

      attempt = 0
      onConnection(true, connectedBefore)
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
    onConnection(false, false)
    await sleep(reconnectDelay(attempt++), signal)
  }
}
