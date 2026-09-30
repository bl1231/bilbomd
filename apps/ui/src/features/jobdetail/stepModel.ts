import type {
  JobStepsDTO,
  JobType,
  StepStatus,
  StepStatusEnum
} from '@bilbomd/bilbomd-types'

export type StepEntry = {
  name: string
  status: StepStatusEnum
  message: string
  startedAt?: Date
  completedAt?: Date
  durationMs?: number
}

// Pipeline order for every job type; unknown steps sort alphabetically after
const STEP_ORDER = [
  'autorg',
  'alphafold',
  'openfold',
  'reduce',
  'rnaview',
  'kgs',
  'ionnet',
  'pdb2crd',
  'pae',
  'minimize',
  'initfoxs',
  'heat',
  'md',
  'dcd2pdb',
  'pdb_remediate',
  'movies',
  'foxs',
  'pepsisans',
  'multifoxs',
  'gasans',
  'scoper',
  'copy_results_to_cfs',
  'results',
  'email'
]

// Steps a job type doesn't run on every deployment. They're hidden only while
// still Waiting, so a step that did run always shows.
const SKIPPED_BY_JOB_TYPE: Partial<Record<JobType, string[]>> = {
  crd: ['autorg', 'pdb2crd', 'pae', 'alphafold'],
  auto: ['autorg', 'alphafold'],
  alphafold: ['autorg'],
  pdb: ['autorg', 'pae', 'alphafold']
}

const NERSC_PREFIX = 'nersc_'

const orderIndex = (name: string) => {
  const i = STEP_ORDER.indexOf(name)
  return i === -1 ? STEP_ORDER.length : i
}

const byPipelineOrder = (a: StepEntry, b: StepEntry) =>
  orderIndex(a.name) - orderIndex(b.name) || a.name.localeCompare(b.name)

const toEntry = (name: string, step: StepStatus): StepEntry => ({
  name,
  status: step.status,
  message: step.message ?? '',
  startedAt: step.started_at,
  completedAt: step.completed_at,
  durationMs: step.duration_ms
})

const entries = (steps: JobStepsDTO | undefined): StepEntry[] =>
  Object.entries(steps ?? {})
    // Mongo subdocuments can carry an _id; anything without a status isn't a step
    .filter(
      (e): e is [string, StepStatus] =>
        e[0] !== '_id' && !!e[1] && typeof e[1] === 'object' && 'status' in e[1]
    )
    .map(([name, step]) => toEntry(name, step))

// Visible steps in pipeline order, with the NERSC/Slurm bookkeeping steps
// split out so they can be shown as their own group.
export const orderedSteps = (
  steps: JobStepsDTO | undefined,
  jobType: JobType
): { pipeline: StepEntry[]; nersc: StepEntry[] } => {
  const skipped = SKIPPED_BY_JOB_TYPE[jobType] ?? []
  const visible = entries(steps).filter(
    (s) => !(skipped.includes(s.name) && s.status === 'Waiting')
  )
  const nerscOrder = (s: StepEntry) =>
    [
      'nersc_prepare_slurm_batch',
      'nersc_submit_slurm_batch',
      'nersc_job_status',
      'nersc_copy_results_to_cfs'
    ].indexOf(s.name)

  return {
    pipeline: visible
      .filter((s) => !s.name.startsWith(NERSC_PREFIX))
      .sort(byPipelineOrder),
    nersc: visible
      .filter((s) => s.name.startsWith(NERSC_PREFIX))
      .sort((a, b) => nerscOrder(a) - nerscOrder(b))
  }
}

export const runningStep = (
  steps: JobStepsDTO | undefined
): StepEntry | undefined => entries(steps).find((s) => s.status === 'Running')

export const erroredStepMessage = (
  steps: JobStepsDTO | undefined
): string | null =>
  entries(steps).find((s) => s.status === 'Error')?.message ?? null

// The worker notes in the md step message when OpenMM fell back to the CPU
export const isCpuFallback = (steps: JobStepsDTO | undefined): boolean =>
  steps?.md?.message?.includes('CUDA unavailable') ?? false

const elapsedMs = (
  start: Date | string | undefined,
  end: Date | string | undefined,
  now: Date
): number | undefined => {
  if (!start) return undefined
  const endTime = end ? new Date(end) : now
  const ms = endTime.getTime() - new Date(start).getTime()
  return isFinite(ms) && ms >= 0 ? ms : undefined
}

// Stored duration when the step finished; elapsed so far while it runs.
// A finished step with no completion time has no meaningful duration.
export const stepDurationMs = (
  step: StepEntry,
  now: Date = new Date()
): number | undefined => {
  if (step.durationMs !== undefined) return step.durationMs
  if (step.status === 'Running')
    return elapsedMs(step.startedAt, undefined, now)
  if (step.completedAt) return elapsedMs(step.startedAt, step.completedAt, now)
  return undefined
}

export const jobDurationMs = (
  job: { startedAt?: Date; completedAt?: Date },
  now: Date = new Date()
): number | undefined => elapsedMs(job.startedAt, job.completedAt, now)

export const formatDuration = (ms: number): string => {
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

const FINISHED_STATUSES = ['Completed', 'Error', 'Failed', 'Cancelled']

export const isFinishedStatus = (status: string | undefined): boolean =>
  !!status && FINISHED_STATUSES.includes(status)
