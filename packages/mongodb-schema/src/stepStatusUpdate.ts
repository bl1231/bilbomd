import type { UpdateWithAggregationPipeline } from 'mongoose'
import type {
  IBilboMDSteps,
  StepStatusEnum
} from './interfaces/jobStepInterface.js'

export interface StepStatusChange {
  status: StepStatusEnum
  // Omit to leave the stored message untouched.
  message?: string
}

// Builds an update pipeline that sets a step's status/message and stamps its
// timing server-side with $$NOW, so clock skew between worker containers
// doesn't matter. Must be sent with `{ updatePipeline: true }` (Mongoose 9).
//
//   Running        -> started_at set only if empty; completed_at/duration cleared
//   Success, Error -> completed_at = now; duration_ms = now - started_at
//   Waiting        -> all timing cleared
//
// "Set only if empty" matters because parallel runs share a step (e.g. every
// per-Rg MD run reports on `md`): started_at stays at the first run's start,
// and the last run to finish sets completed_at, so duration covers the stage.
export const buildStepStatusUpdate = (
  stepName: keyof IBilboMDSteps,
  { status, message }: StepStatusChange
): UpdateWithAggregationPipeline => {
  const path = `steps.${stepName}`
  const startedAt = `$${path}.started_at`

  // Values in a pipeline are expressions: wrap caller-supplied strings in
  // $literal so a message like "$HOME not set" isn't read as a field path.
  const fields: Record<string, unknown> = {
    [`${path}.status`]: { $literal: status }
  }
  if (message !== undefined) {
    fields[`${path}.message`] = { $literal: message }
  }

  if (status === 'Running') {
    fields[`${path}.started_at`] = { $ifNull: [startedAt, '$$NOW'] }
    fields[`${path}.completed_at`] = '$$REMOVE'
    fields[`${path}.duration_ms`] = '$$REMOVE'
  } else if (status === 'Success' || status === 'Error') {
    fields[`${path}.completed_at`] = '$$NOW'
    fields[`${path}.duration_ms`] = {
      $cond: [
        { $ifNull: [startedAt, false] },
        { $subtract: ['$$NOW', startedAt] },
        '$$REMOVE'
      ]
    }
  } else {
    fields[`${path}.started_at`] = '$$REMOVE'
    fields[`${path}.completed_at`] = '$$REMOVE'
    fields[`${path}.duration_ms`] = '$$REMOVE'
  }

  return [{ $set: fields }]
}
