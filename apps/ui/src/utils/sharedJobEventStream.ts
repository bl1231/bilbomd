import type { JobEvent } from '@bilbomd/bilbomd-types'

// Shares one job event stream between all of a browser's tabs.
//
// Over HTTP/1.1 a browser keeps at most 6 connections open per site, across
// all tabs, and every open event stream holds one. With a stream per tab, a
// sixth tab would leave no connection for anything else and the page would
// hang. So the tabs elect a leader with a Web Lock: the tab holding the lock
// opens the stream and rebroadcasts what it receives over a
// BroadcastChannel; the others just listen. When the leader tab closes, the
// browser releases the lock and a waiting tab takes over.
//
// Browsers without Web Locks or BroadcastChannel fall back to a stream per
// tab.

type OnEvent = (event: JobEvent) => void
type OnConnection = (connected: boolean, resumed: boolean) => void

type Message =
  | { type: 'event'; event: JobEvent }
  | { type: 'connection'; connected: boolean; resumed: boolean }
  // A tab that just joined asks the leader for the current connection state
  | { type: 'hello' }

export interface SharedJobEventStreamOptions {
  // Identifies the stream: tabs with the same name share one. Include
  // whatever makes the stream different (the user, or the public job).
  name: string
  signal: AbortSignal
  onEvent: OnEvent
  onConnection: OnConnection
  // Opens the actual stream; resolves when it stops (signal aborted, or
  // it gave up)
  open: (
    signal: AbortSignal,
    onEvent: OnEvent,
    onConnection: OnConnection
  ) => Promise<void>
}

export const shareJobEventStream = ({
  name,
  signal,
  onEvent,
  onConnection,
  open
}: SharedJobEventStreamOptions): void => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks || typeof BroadcastChannel === 'undefined') {
    void open(signal, onEvent, onConnection)
    return
  }

  const channel = new BroadcastChannel(name)
  const post = (message: Message) => {
    try {
      channel.postMessage(message)
    } catch {
      // closed
    }
  }

  let leading = false
  // The last connection state seen, as leader or follower
  let connected = false
  // Whether any tab's stream has been connected since this tab joined. A
  // tab taking over after that may have missed events in the handover.
  let everConnected = false

  channel.onmessage = ({ data }: MessageEvent<Message>) => {
    if (data.type === 'hello') {
      // A new tab starts out assuming "not connected"; only correct that
      if (leading && connected) {
        post({ type: 'connection', connected, resumed: false })
      }
      return
    }
    if (leading) return
    if (data.type === 'event') {
      onEvent(data.event)
    } else if (data.type === 'connection') {
      connected = data.connected
      if (data.connected) everConnected = true
      onConnection(data.connected, data.resumed)
    }
  }
  post({ type: 'hello' })

  locks
    .request(name, { signal }, async () => {
      leading = true
      // Taking over from a stream that was up: events may have been missed
      // in the handover, so the first connection counts as resumed
      let tookOver = everConnected
      await open(
        signal,
        (event) => {
          onEvent(event)
          post({ type: 'event', event })
        },
        (isConnected, resumed) => {
          const wasResumed = resumed || (isConnected && tookOver)
          if (isConnected) {
            tookOver = false
            everConnected = true
          }
          connected = isConnected
          onConnection(isConnected, wasResumed)
          post({
            type: 'connection',
            connected: isConnected,
            resumed: wasResumed
          })
        }
      )
      leading = false
    })
    .catch(() => {
      // AbortError: this tab closed its stream while waiting for the lock
    })

  signal.addEventListener(
    'abort',
    () => {
      if (leading)
        post({ type: 'connection', connected: false, resumed: false })
      channel.close()
    },
    { once: true }
  )
}
