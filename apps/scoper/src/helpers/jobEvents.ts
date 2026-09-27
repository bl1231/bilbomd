import {
  createJobEventNotifier,
  type JobEventKind,
  type JobEventNotifier
} from '@bilbomd/bilbomd-types'
import { logger } from './loggers.js'

// Tells the backend (and through it, the browser) that a job changed, over
// Redis pub/sub. See createJobEventNotifier in @bilbomd/bilbomd-types.
// A no-op until configureJobEvents() is called at startup, so modules that
// notify can be imported (and unit tested) without Redis. Never throws.

interface Publisher {
  publish: (channel: string, message: string) => Promise<unknown>
}

let notifier: JobEventNotifier | null = null

export const configureJobEvents = (
  publisher: Publisher | null,
  options: { throttleMs?: number } = {}
): void => {
  notifier?.close()
  notifier = publisher
    ? createJobEventNotifier({
        publish: (channel, message) => publisher.publish(channel, message),
        throttleMs: options.throttleMs,
        onError: (error, event) =>
          logger.warn(
            `Failed to publish job event for ${event.jobId}: ${error}`
          )
      })
    : null
}

export const notifyJobChanged = (
  job: { _id: unknown; user?: unknown },
  kind: JobEventKind = 'updated'
): void => {
  notifier?.notify(job, kind)
}
