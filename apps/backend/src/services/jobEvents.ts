import type { Redis } from 'ioredis'
import {
  JOB_EVENT_KINDS,
  JOB_EVENTS_CHANNEL,
  type JobEvent
} from '@bilbomd/bilbomd-types'
import { logger } from '../middleware/loggers.js'

// Fans job events from Redis (published by workers and the backend) out to
// connected browsers. A logged-in browser (GET /jobs/events) gets events for
// the jobs it may see: its own, or every job for Admins and Managers, the
// same rule as getAllJobs and verifyJobOwnership. A public job page
// (GET /public/jobs/:publicId/events) gets events for its one job only.

export interface JobEventClient {
  // Requesting user's MongoDB _id; unset for privileged and public clients
  userId?: string
  privileged: boolean
  // Set for a public job page: only this job's events, whatever its owner
  jobId?: string
  send: (event: JobEvent) => void
  close: () => void
}

interface Publisher {
  publish: (channel: string, message: string) => Promise<unknown>
}

const clients = new Set<JobEventClient>()

// Registers a connected browser; returns a function that removes it
export const addJobEventClient = (client: JobEventClient): (() => void) => {
  clients.add(client)
  return () => {
    clients.delete(client)
  }
}

export const jobEventClientCount = (): number => clients.size

export const canSeeJobEvent = (
  client: JobEventClient,
  event: JobEvent
): boolean => {
  if (client.jobId !== undefined) return event.jobId === client.jobId
  return (
    client.privileged ||
    (event.ownerId !== undefined && event.ownerId === client.userId)
  )
}

const parseJobEvent = (raw: string): JobEvent | null => {
  let msg: Partial<JobEvent>
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof msg.jobId !== 'string' || !msg.jobId) return null
  if (!msg.kind || !JOB_EVENT_KINDS.includes(msg.kind)) return null
  if (msg.ownerId !== undefined && typeof msg.ownerId !== 'string') return null
  return { jobId: msg.jobId, ownerId: msg.ownerId, kind: msg.kind }
}

export const dispatchJobEvent = (raw: string): void => {
  const event = parseJobEvent(raw)
  if (!event) {
    logger.warn(`Ignoring malformed job event: ${raw}`)
    return
  }
  for (const client of clients) {
    if (!canSeeJobEvent(client, event)) continue
    try {
      client.send(event)
    } catch (error) {
      logger.warn(`Failed to send job event to a client: ${error}`)
    }
  }
}

// A subscribed ioredis connection can't run other commands, so this takes
// its own (e.g. redis.duplicate()). Returns a function that unsubscribes and
// closes it.
export const startJobEventSubscriber = async (
  subscriber: Redis
): Promise<() => Promise<void>> => {
  subscriber.on('message', (channel: string, raw: string) => {
    if (channel === JOB_EVENTS_CHANNEL) dispatchJobEvent(raw)
  })
  await subscriber.subscribe(JOB_EVENTS_CHANNEL)
  logger.info(`Forwarding job events from ${JOB_EVENTS_CHANNEL}`)

  return async () => {
    await subscriber.unsubscribe(JOB_EVENTS_CHANNEL)
    await subscriber.quit()
  }
}

// Ends every open stream. server.close() waits for open connections, so
// shutdown has to end these long-lived ones itself. Browsers reconnect to
// the next backend instance.
export const closeAllJobEventClients = (): void => {
  for (const client of clients) {
    try {
      client.close()
    } catch {
      // already closed
    }
  }
  clients.clear()
}

export const publishJobEvent = async (
  publisher: Publisher,
  event: JobEvent
): Promise<void> => {
  try {
    await publisher.publish(JOB_EVENTS_CHANNEL, JSON.stringify(event))
  } catch (error) {
    // A lost event only delays the UI until its next fallback poll
    logger.warn(`Failed to publish job event for ${event.jobId}: ${error}`)
  }
}
