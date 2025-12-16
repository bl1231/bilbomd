import mongoose, { Types, Schema } from 'mongoose'
import type { IUsageEvent, IUser } from '@bilbomd/mongodb-schema'

type PipelineType =
  | 'pdb'
  | 'crd'
  | 'auto'
  | 'alphafold'
  | 'sans'
  | 'scoper'
  | 'multi'
type EventType =
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'
  | 'job_resubmitted'

// Type guard functions for safe shape validation
interface PopulatedUserShape {
  _id: Types.ObjectId | string
  username: string
  email: string
}

interface SummaryUserShape {
  id: string
  username: string
  email: string
}

const isPopulatedUserShape = (obj: unknown): obj is PopulatedUserShape => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '_id' in obj &&
    'username' in obj &&
    'email' in obj &&
    (obj._id instanceof Types.ObjectId || typeof obj._id === 'string') &&
    typeof obj.username === 'string' &&
    typeof obj.email === 'string'
  )
}

const isSummaryUserShape = (obj: unknown): obj is SummaryUserShape => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'username' in obj &&
    'email' in obj &&
    typeof obj.id === 'string' &&
    typeof obj.username === 'string' &&
    typeof obj.email === 'string'
  )
}

// Helper to create proper context user structure
const createContextUser = (
  _id: Types.ObjectId,
  username: string,
  email: string
): { _id: Schema.Types.ObjectId; username: string; email: string } => {
  // At runtime, Types.ObjectId and Schema.Types.ObjectId are compatible
  // This helper encapsulates the type assertion in one place
  return {
    _id: _id as unknown as Schema.Types.ObjectId,
    username,
    email
  }
}

// Accept either a populated mongoose user with _id, or a monorepo DTO with id
export const buildContext = (params: {
  access_mode: 'user' | 'anonymous'
  user?: Record<string, unknown> | Types.ObjectId | string | IUser | null
  public_id?: string
  client_ip_hash?: string
}): IUsageEvent['context'] => {
  const { access_mode, user, public_id, client_ip_hash } = params

  let contextUser:
    | { _id: Schema.Types.ObjectId; username: string; email: string }
    | undefined

  if (access_mode === 'user') {
    if (isPopulatedUserShape(user)) {
      const normalizedId =
        typeof user._id === 'string' ? new Types.ObjectId(user._id) : user._id
      contextUser = createContextUser(normalizedId, user.username, user.email)
    } else if (isSummaryUserShape(user)) {
      contextUser = createContextUser(
        new Types.ObjectId(user.id),
        user.username,
        user.email
      )
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
  nersc?: { qos?: string; jobid?: string }
  context: IUsageEvent['context']
  metadata?: Record<string, unknown>
}) => {
  try {
    const UsageEvent = mongoose.model<IUsageEvent>('UsageEvent')
    await UsageEvent.create({
      uuid: params.uuid,
      job_id: new Types.ObjectId(
        typeof params.jobId === 'string'
          ? params.jobId
          : params.jobId.toString()
      ),
      pipeline: params.pipeline,
      event_type: params.eventType,
      status: params.status,
      duration_ms: params.durationMs,
      nersc: params.nersc,
      context: params.context,
      metadata: params.metadata
    })
  } catch (err) {
    console.warn('Worker UsageEvent recording failed:', err)
  }
}

export const toPipeline = (mode: string): PipelineType => {
  if (mode === 'crd_psf') return 'crd'

  const validPipelines: PipelineType[] = [
    'pdb',
    'crd',
    'auto',
    'alphafold',
    'sans',
    'scoper',
    'multi'
  ]

  if (validPipelines.includes(mode as PipelineType)) {
    return mode as PipelineType
  }

  throw new Error(`Invalid pipeline mode: ${mode}`)
}
