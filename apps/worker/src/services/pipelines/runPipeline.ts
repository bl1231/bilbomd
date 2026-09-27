import { Job as BullMQJob } from 'bullmq'
import type {
  IJob,
  IBilboMDSteps,
  MDEngineEnum,
  PipelineType
} from '@bilbomd/mongodb-schema'
import {
  initializeJob,
  cleanupJob,
  runPipelineStep
} from '../functions/job-utils.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usage-events.js'
import { createProgressTracker } from '../functions/progress-tracker.js'

export interface PipelineContext<J> {
  MQjob: BullMQJob
  job: J
  engine: MDEngineEnum
}

export interface PipelineStep<J> {
  // Log label ("start <label>" / "end <label>")
  label: string
  // Step whose status is set to Error if this fails
  stepKey?: keyof IBilboMDSteps
  run: (ctx: PipelineContext<J>) => Promise<void> | void
  // Job progress (0–100) once this step has finished
  progress?: number
  // Skip the step unless this returns true (evaluated when the step is reached)
  when?: (ctx: PipelineContext<J>) => boolean
  // Run inline instead of through runPipelineStep: no start/end log and no
  // error handling. For fire-and-forget work such as enqueueing movies.
  detached?: boolean
}

interface JobModel<J> {
  findOne(filter: { _id: string }): {
    populate(path: string): { exec(): Promise<J | null> }
  }
}

export interface PipelineDefinition<J extends IJob> {
  pipeline: PipelineType
  model: JobModel<J>
  // Engine when the job doesn't specify one
  defaultEngine: MDEngineEnum
  // Force an engine regardless of the job (e.g. CRD/PSF input is CHARMM-only)
  fixedEngine?: MDEngineEnum
  // Engines this pipeline can run; others are rejected before any work starts
  supportedEngines?: MDEngineEnum[]
  unsupportedEngineMessage?: (engine: MDEngineEnum) => string
  steps: (ctx: PipelineContext<J>) => PipelineStep<J>[]
}

const usageContext = (job: IJob) =>
  buildContext({
    access_mode: job.access_mode,
    user: job.user,
    public_id: job.public_id,
    client_ip_hash: job.client_ip_hash
  })

// Runs a BilboMD pipeline: loads the job, records usage events, picks the MD
// engine, initializes, runs each step with progress updates, and cleans up.
// A failing step marks the job (and its step) as Error via runPipelineStep
// and stops the pipeline.
export const runPipeline = async <J extends IJob>(
  MQjob: BullMQJob,
  def: PipelineDefinition<J>
): Promise<void> => {
  await MQjob.updateProgress(1)

  const job = await def.model
    .findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!job) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }

  const progress = createProgressTracker(MQjob, job)
  await progress.update(5)

  await recordWorkerUsageEvent({
    uuid: job.uuid,
    jobId: job._id,
    pipeline: def.pipeline,
    eventType: 'job_started',
    status: 'Running',
    context: usageContext(job)
  })

  const engine = def.fixedEngine ?? job.md_engine ?? def.defaultEngine
  if (def.supportedEngines && !def.supportedEngines.includes(engine)) {
    throw new Error(
      def.unsupportedEngineMessage?.(engine) ??
        `The ${def.pipeline} pipeline does not support md_engine=${engine}`
    )
  }
  await MQjob.log(`Using MD engine: ${engine}`)

  await initializeJob(MQjob, job)
  await progress.update(10)

  const ctx: PipelineContext<J> = { MQjob, job, engine }
  for (const step of def.steps(ctx)) {
    if (step.when && !step.when(ctx)) continue
    if (step.detached) {
      await step.run(ctx)
    } else {
      await runPipelineStep(MQjob, job, step.label, step.stepKey, async () => {
        await step.run(ctx)
      })
    }
    if (step.progress !== undefined) await progress.update(step.progress)
  }

  await cleanupJob(MQjob, job)
  await progress.update(100)

  const durationMs =
    job.time_started && job.time_completed
      ? new Date(job.time_completed).getTime() -
        new Date(job.time_started).getTime()
      : undefined
  await recordWorkerUsageEvent({
    uuid: job.uuid,
    jobId: job._id,
    pipeline: def.pipeline,
    eventType: 'job_completed',
    status: 'Completed',
    durationMs,
    context: usageContext(job)
  })
}
