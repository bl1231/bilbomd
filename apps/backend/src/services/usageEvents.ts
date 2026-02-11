import mongoose, { Types } from 'mongoose'
import type { IUsageEvent } from '@bilbomd/mongodb-schema'
import { logger } from '../middleware/loggers.js'

type PipelineType =
  | 'pdb'
  | 'crd'
  | 'auto'
  | 'alphafold'
  | 'sans'
  | 'scoper'
  | 'multi'
type EventType =
  | 'job_submitted'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'job_resubmitted'

export const recordUsageEvent = async (params: {
  uuid: string
  jobId?: string | Types.ObjectId
  pipeline: PipelineType
  eventType: EventType
  accessMode: 'user' | 'anonymous'
  user?: { _id: Types.ObjectId; username: string; email: string }
  publicId?: string
  clientIpHash?: string
  status?:
    | 'Submitted'
    | 'Pending'
    | 'Running'
    | 'Completed'
    | 'Error'
    | 'Failed'
    | 'Cancelled'
  durationMs?: number
  nersc?: { qos?: string; jobid?: string }
  metadata?: Record<string, unknown>
}) => {
  const {
    uuid,
    jobId,
    pipeline,
    eventType,
    accessMode,
    user,
    publicId,
    clientIpHash,
    status,
    durationMs,
    nersc,
    metadata
  } = params

  try {
    const UsageEvent = mongoose.model<IUsageEvent>('UsageEvent')
    await UsageEvent.create({
      uuid,
      job_id: jobId
        ? new Types.ObjectId(
            typeof jobId === 'string' ? jobId : jobId.toString()
          )
        : undefined,
      pipeline,
      event_type: eventType,
      status,
      duration_ms: durationMs,
      nersc,
      context: {
        access_mode: accessMode,
        user,
        public_id: publicId,
        client_ip_hash: clientIpHash
      },
      metadata
    })
  } catch (err) {
    // Swallow errors to avoid impacting job submission
    logger.warn(`UsageEvent recording failed: ${err}`)
  }
}
