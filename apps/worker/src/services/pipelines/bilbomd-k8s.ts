import { Job as BullMQJob } from 'bullmq'
import { Job as DBJob, MultiJob } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { getErrorMessage } from '../../helpers/errors.js'
import { currentAbortSignal } from '../../helpers/jobCancellation.js'
import { logger } from '../../helpers/loggers.js'
import {
  buildJobManifest,
  classifyJob,
  createK8sJobClient,
  isFinished,
  jobName,
  LABELS,
  type K8sJobClient,
  type K8sQueue,
  type K8sSettings
} from '../functions/k8s-job.js'

// The k8s execution backend: runs a BilboMD job as a Kubernetes Job and waits
// for it. The BullMQ job stays active (and locked) the whole time, so the
// worker's BullMQ concurrency caps how many Jobs run at once, a failure
// reaches the worker's usual 'failed' handler, and a cancel aborts this wait
// and deletes the Job.
//
// The pod runs the normal pipeline and records its own progress, step status
// and results in MongoDB. This side only reports what the pod can't: OOM
// kills, deadlines, image pulls, a pod that never starts.

interface Deps {
  client: K8sJobClient
  settings: K8sSettings
  now: () => Date
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })

let defaultClient: K8sJobClient | undefined
const defaultDeps = (): Deps => {
  defaultClient ??= createK8sJobClient()
  return {
    client: defaultClient,
    settings: config.k8s,
    now: () => new Date(),
    sleep: abortableSleep
  }
}

// Consecutive failed Kubernetes API calls tolerated while polling (an API
// server restart shouldn't fail a job that is still running)
const MAX_POLL_ERRORS = 20
// How long to wait for an old attempt's Job to be deleted before replacing it
const REPLACE_TIMEOUT_MS = 2 * 60 * 1000
const REPLACE_POLL_MS = 2_000

type JobData = { jobid?: string; type?: string }

// Which BilboMD jobs need a GPU: OpenMM's minimize/heat/MD steps (and the
// structure predictions, which always use OpenMM). CHARMM and MultiFoXS run
// on CPUs only.
export const needsGpu = (type: string | undefined, mdEngine?: string) =>
  type === 'alphafold' ||
  type === 'openfold' ||
  (type !== 'crd_psf' && mdEngine === 'OpenMM')

const loadJob = async (queue: K8sQueue, jobid: string) => {
  const found =
    queue === 'multimd'
      ? await MultiJob.findById(jobid).exec()
      : await DBJob.findById(jobid).exec()
  if (!found) throw new Error(`No job found for: ${jobid}`)
  return found as { uuid: string; status?: string; md_engine?: string }
}

const sleepUntilGone = async (name: string, deps: Deps): Promise<void> => {
  const deadline = deps.now().getTime() + REPLACE_TIMEOUT_MS
  while (await deps.client.readJob(name)) {
    if (deps.now().getTime() > deadline) {
      throw new Error(
        `Kubernetes Job ${name} from an earlier attempt was not deleted in time`
      )
    }
    await deps.sleep(REPLACE_POLL_MS)
  }
}

// Creates the Job. If it already exists it is either this attempt's Job (the
// dispatcher restarted, so carry on watching it) or a finished Job from an
// earlier attempt (BullMQ is retrying, so replace it).
const submit = async (
  MQjob: BullMQJob,
  manifest: ReturnType<typeof buildJobManifest>,
  deps: Deps
): Promise<void> => {
  const name = manifest.metadata!.name!
  const attempt = manifest.metadata!.labels![LABELS.attempt]

  if (await deps.client.createJob(manifest)) {
    logger.info(`Created Kubernetes Job ${name}`)
    await MQjob.log(`Created Kubernetes Job ${name}`)
    return
  }

  const existing = await deps.client.readJob(name)
  if (existing) {
    const existingAttempt = existing.metadata?.labels?.[LABELS.attempt]
    if (existingAttempt === attempt || !isFinished(existing)) {
      logger.info(
        `Kubernetes Job ${name} already exists (attempt ${existingAttempt}); watching it`
      )
      await MQjob.log(`Watching existing Kubernetes Job ${name}`)
      return
    }
    logger.info(
      `Replacing finished Kubernetes Job ${name} from attempt ${existingAttempt}`
    )
    await deps.client.deleteJob(name)
    await sleepUntilGone(name, deps)
  }

  if (!(await deps.client.createJob(manifest))) {
    throw new Error(`Kubernetes Job ${name} exists but could not be read`)
  }
  logger.info(`Created Kubernetes Job ${name}`)
  await MQjob.log(`Created Kubernetes Job ${name}`)
}

const cancel = async (name: string, deps: Deps): Promise<never> => {
  logger.info(`Deleting Kubernetes Job ${name} (job cancelled)`)
  try {
    await deps.client.deleteJob(name)
  } catch (error) {
    logger.error(
      `Failed to delete Kubernetes Job ${name}: ${getErrorMessage(error)}`
    )
  }
  // runCancellable turns this into a JobCancelledError
  throw new Error(`Kubernetes Job ${name} cancelled`)
}

const waitForJob = async (
  queue: K8sQueue,
  MQjob: BullMQJob,
  jobid: string,
  name: string,
  deps: Deps
): Promise<void> => {
  const signal = currentAbortSignal()
  let pollErrors = 0
  let warnedPending = false

  for (;;) {
    if (signal?.aborted) await cancel(name, deps)

    let job
    let pods
    try {
      job = await deps.client.readJob(name)
      pods = job ? await deps.client.listJobPods(name) : []
      pollErrors = 0
    } catch (error) {
      pollErrors++
      logger.warn(
        `Polling Kubernetes Job ${name} failed (${pollErrors}/${MAX_POLL_ERRORS}): ${getErrorMessage(error)}`
      )
      if (pollErrors >= MAX_POLL_ERRORS) throw error
      await deps.sleep(deps.settings.pollIntervalMs, signal)
      continue
    }

    if (!job) {
      // Deleted by hand, or removed by its TTL while the dispatcher was down.
      // The pod records a finished job in MongoDB, so that has the outcome.
      const status = (await loadJob(queue, jobid)).status
      if (status === 'Completed') return
      throw new Error(
        `Kubernetes Job ${name} disappeared before the job finished (status ${status})`
      )
    }

    const state = classifyJob(job, pods, deps.now(), deps.settings)
    switch (state.phase) {
      case 'succeeded':
        logger.info(`Kubernetes Job ${name} succeeded`)
        return
      case 'failed':
        throw new Error(`Kubernetes Job ${name} failed: ${state.reason}`)
      case 'pending': {
        const waited = state.since
          ? deps.now().getTime() - state.since.getTime()
          : 0
        if (!warnedPending && waited >= deps.settings.pendingWarnMs) {
          warnedPending = true
          const message = `Kubernetes Job ${name} still waiting after ${Math.round(waited / 60_000)} min: ${state.reason}`
          logger.warn(message)
          await MQjob.log(message)
        }
        break
      }
      case 'running':
        break
    }
    await deps.sleep(deps.settings.pollIntervalMs, signal)
  }
}

export const runJobOnK8s = async (
  queue: K8sQueue,
  MQjob: BullMQJob,
  deps: Deps = defaultDeps()
): Promise<void> => {
  const { jobid, type } = MQjob.data as JobData
  if (!jobid) throw new Error(`BullMQ job ${MQjob.id} has no jobid`)
  if (!MQjob.id) throw new Error('BullMQ job has no id')

  const dbJob = await loadJob(queue, jobid)
  const name = jobName(queue, dbJob.uuid)
  const manifest = buildJobManifest(
    {
      queue,
      bullmqJobId: MQjob.id,
      uuid: dbJob.uuid,
      attempt: MQjob.attemptsMade,
      needsGpu: queue === 'bilbomd' && needsGpu(type, dbJob.md_engine)
    },
    deps.settings
  )

  await submit(MQjob, manifest, deps)
  await waitForJob(queue, MQjob, jobid, name, deps)
}

export const processBilboMDJobK8s = (MQjob: BullMQJob) =>
  runJobOnK8s('bilbomd', MQjob)

export const processMultiMDJobK8s = (MQjob: BullMQJob) =>
  runJobOnK8s('multimd', MQjob)
