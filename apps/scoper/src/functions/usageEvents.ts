import { Types } from 'mongoose'
import { UsageEvent } from '@bilbomd/mongodb-schema'
import type {
  IUsageEvent,
  IUsageEventContext,
  IUser
} from '@bilbomd/mongodb-schema'

type PipelineType = 'scoper'
type EventType =
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'job_resubmitted'

export const buildContext = (params: {
  access_mode: 'user' | 'anonymous'
  user?: Record<string, unknown> | Types.ObjectId | string | IUser | null
  public_id?: string
  client_ip_hash?: string
}): IUsageEventContext => {
  const { access_mode, user, public_id, client_ip_hash } = params

  let contextUser:
    | { _id: Types.ObjectId; username: string; email: string }
    | undefined

  if (access_mode === 'user') {
    if (user && typeof user === 'object') {
      const obj = user as Record<string, unknown>
      const hasPopulatedShape =
        (obj._id instanceof Types.ObjectId || typeof obj._id === 'string') &&
        typeof obj.username === 'string' &&
        typeof obj.email === 'string'
      const hasSummaryShape =
        typeof obj.id === 'string' &&
        typeof obj.username === 'string' &&
        typeof obj.email === 'string'

      if (hasPopulatedShape) {
        const rawId = obj._id as Types.ObjectId | string
        const normalizedId =
          typeof rawId === 'string' ? new Types.ObjectId(rawId) : rawId
        contextUser = {
          _id: normalizedId,
          username: obj.username as string,
          email: obj.email as string
        }
      } else if (hasSummaryShape) {
        contextUser = {
          _id: new Types.ObjectId(obj.id as string),
          username: obj.username as string,
          email: obj.email as string
        }
      }
    }
  }

  return { access_mode, user: contextUser, public_id, client_ip_hash }
}

export const recordWorkerUsageEvent = async (params: {
  uuid: string
  jobId: string | Types.ObjectId
  pipeline: PipelineType
  eventType: EventType
  status?:
    | 'Submitted'
    | 'Pending'
    | 'Running'
    | 'Completed'
    | 'Error'
    | 'Failed'
    | 'Cancelled'
  durationMs?: number
  context: IUsageEventContext
  metadata?: Record<string, unknown>
}) => {
  try {
    const doc: IUsageEvent = {
      uuid: params.uuid,
      job_id: new Types.ObjectId(
        typeof params.jobId === 'string'
          ? params.jobId
          : params.jobId.toString()
      ),
      pipeline: params.pipeline,
      event_type: params.eventType,
      timestamp: new Date(),
      status: params.status,
      duration_ms: params.durationMs,
      context: params.context,
      metadata: params.metadata
    }
    await new UsageEvent(doc).save()
  } catch (err) {
    console.warn('Scoper UsageEvent recording failed:', err)
  }
}
