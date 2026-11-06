import { Job as BullMQJob } from 'bullmq'
import { Job as DBJob, MultiJob } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { WORKER_CONCURRENCY } from '../../config/constants.js'
import { getErrorMessage } from '../../helpers/errors.js'
import {
  currentAbortSignal,
  JobCancelledError
} from '../../helpers/jobCancellation.js'
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
// for it. The BullMQ job stays active (and locked) the whole time, so a
// failure reaches the worker's usual 'failed' handler and a cancel aborts this
// wait and deletes the Job.
//
// The pod runs the normal pipeline and records its own progress, step status
// and results in MongoDB. This side only reports what the pod can't: OOM
// kills, deadlines, image pulls, a pod that never starts.
//
// Two rules keep the cluster and BullMQ in step:
// - This handler doesn't return or throw while the Job's pod may still be
//   running, except to hand the Job to a later attempt (which adopts it). A
//   failure on a Job that hasn't finished deletes it and waits for its pods
//   first; Kubernetes API outages are ridden out until the Job's own
//   deadline has passed.
// - New Jobs are only created while fewer than the cap are running in the
//   cluster, counting Jobs left running by an earlier dispatcher.

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

// Longest wait between retries while the Kubernetes API is failing
const MAX_RETRY_DELAY_MS = 60_000
// After a Job's deadline Kubernetes has stopped its pod; allow this much
// longer for the API to come back before giving up on it
const DEADLINE_MARGIN_MS = 15 * 60 * 1000
// How long a deleted Job may take to go away (its pods get 60 s to stop)
const DELETE_TIMEOUT_MS = 5 * 60 * 1000
const DELETE_POLL_MS = 2_000

type JobData = { jobid?: string; type?: string; uuid?: string }
type DBJobFields = { uuid: string; status?: string; md_engine?: string }

// Which BilboMD jobs need a GPU: OpenMM's minimize/heat/MD steps (and the
// structure predictions, which always use OpenMM). CHARMM and MultiFoXS run
// on CPUs only.
export const needsGpu = (type: string | undefined, mdEngine?: string) =>
  type === 'alphafold' ||
  type === 'openfold' ||
  (type !== 'crd_psf' && mdEngine === 'OpenMM')

// Jobs of each queue that may run at once
const jobCap = (queue: K8sQueue, settings: K8sSettings) =>
  queue === 'multimd' ? WORKER_CONCURRENCY.MULTI_MD : settings.maxJobs

// null when the document is gone (the job was deleted)
const loadJob = async (
  queue: K8sQueue,
  jobid: string
): Promise<DBJobFields | null> => {
  const found =
    queue === 'multimd'
      ? await MultiJob.findById(jobid).exec()
      : await DBJob.findById(jobid).exec()
  return found as DBJobFields | null
}

// The job's document was deleted, which also cancels it (the backend's cancel
// message may have been missed while the dispatcher was down)
class JobDeletedError extends JobCancelledError {}

// Calls fn until it succeeds, backing off while the Kubernetes API fails,
// until `giveUpAt`
const retryUntil = async <T>(
  what: string,
  fn: () => Promise<T>,
  giveUpAt: number,
  deps: Deps
): Promise<T> => {
  let delay = deps.settings.pollIntervalMs
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (deps.now().getTime() >= giveUpAt) throw error
      logger.warn(
        `${what} failed (attempt ${attempt}), retrying in ${Math.round(delay / 1000)} s: ${getErrorMessage(error)}`
      )
      await deps.sleep(delay)
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    }
  }
}

// When to stop retrying for a Job: once its deadline has passed, Kubernetes
// has stopped its pod, so nothing is left running
const giveUpTime = (createdAt: Date | undefined, deps: Deps): number =>
  (createdAt ?? deps.now()).getTime() +
  deps.settings.activeDeadlineSeconds * 1000 +
  DEADLINE_MARGIN_MS

// Deletes the Job and waits until it (and so its pods) are gone
const deleteAndWait = async (
  name: string,
  deps: Deps,
  giveUpAt: number
): Promise<void> => {
  await retryUntil(
    `Deleting Kubernetes Job ${name}`,
    () => deps.client.deleteJob(name),
    giveUpAt,
    deps
  )
  const deadline = deps.now().getTime() + DELETE_TIMEOUT_MS
  while (
    await retryUntil(
      `Reading Kubernetes Job ${name}`,
      () => deps.client.readJob(name),
      giveUpAt,
      deps
    )
  ) {
    if (deps.now().getTime() > deadline) {
      throw new Error(`Kubernetes Job ${name} was not deleted in time`)
    }
    await deps.sleep(DELETE_POLL_MS)
  }
}

// One new Job at a time per process, so two handlers can't both see the
// last free slot
let admission: Promise<unknown> = Promise.resolve()
const admitOneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = admission.then(fn, fn)
  admission = run.catch(() => undefined)
  return run
}

// Waits until fewer than the cap of this queue's Jobs are running in the
// cluster (other than `name`)
const waitForCapacity = async (
  queue: K8sQueue,
  MQjob: BullMQJob,
  name: string,
  deps: Deps
): Promise<void> => {
  const signal = currentAbortSignal()
  const cap = jobCap(queue, deps.settings)
  let logged = false
  for (;;) {
    if (signal?.aborted) throw new Error('cancelled while waiting to start')
    try {
      const running = (await deps.client.listActiveJobs(queue)).filter(
        (other) => other !== name
      )
      if (running.length < cap) return
      if (!logged) {
        logged = true
        const message = `Waiting to start: ${running.length} ${queue} Kubernetes Jobs are running (limit ${cap})`
        logger.info(`${name}: ${message}`)
        await MQjob.log(message)
      }
    } catch (error) {
      logger.warn(
        `Counting running Kubernetes Jobs failed: ${getErrorMessage(error)}`
      )
    }
    await deps.sleep(deps.settings.pollIntervalMs, signal)
  }
}

type Submitted = 'watching' | 'already-completed'

// Creates the Job, or finds the one to watch. An existing Job is either this
// attempt's (the dispatcher restarted, so carry on watching it), one that is
// still running (watch it rather than start a second copy), or a finished
// Job from an earlier attempt (BullMQ is retrying, so replace it).
const submit = async (
  queue: K8sQueue,
  MQjob: BullMQJob,
  manifest: ReturnType<typeof buildJobManifest>,
  dbJob: DBJobFields,
  deps: Deps
): Promise<Submitted> => {
  const name = manifest.metadata!.name!
  const attempt = manifest.metadata!.labels![LABELS.attempt]
  const giveUpAt = giveUpTime(undefined, deps)

  const existing = await retryUntil(
    `Reading Kubernetes Job ${name}`,
    () => deps.client.readJob(name),
    giveUpAt,
    deps
  )
  if (existing) {
    const existingAttempt = existing.metadata?.labels?.[LABELS.attempt]
    if (existingAttempt === attempt || !isFinished(existing)) {
      logger.info(
        `Kubernetes Job ${name} already exists (attempt ${existingAttempt}); watching it`
      )
      await MQjob.log(`Watching existing Kubernetes Job ${name}`)
      return 'watching'
    }
    logger.info(
      `Replacing finished Kubernetes Job ${name} from attempt ${existingAttempt}`
    )
    await deleteAndWait(name, deps, giveUpAt)
  }

  // A pod already finished this job (e.g. its Job expired while the
  // dispatcher was down); don't run it again
  if (dbJob.status === 'Completed') {
    logger.info(`${name}: job already completed; not starting it again`)
    return 'already-completed'
  }

  return admitOneAtATime(async () => {
    await waitForCapacity(queue, MQjob, name, deps)
    const created = await retryUntil(
      `Creating Kubernetes Job ${name}`,
      () => deps.client.createJob(manifest),
      giveUpAt,
      deps
    )
    if (created) {
      logger.info(`Created Kubernetes Job ${name}`)
      await MQjob.log(`Created Kubernetes Job ${name}`)
    } else {
      // Created by someone else since we looked; watch that one
      await MQjob.log(`Watching existing Kubernetes Job ${name}`)
    }
    return 'watching' as const
  })
}

// Deletes the Job of a cancelled (or deleted) job, retrying until the
// Kubernetes API accepts it: nothing else will stop the pod
const cancel = async (
  name: string,
  createdAt: Date | undefined,
  deps: Deps,
  reason: string
): Promise<never> => {
  logger.info(`Deleting Kubernetes Job ${name} (${reason})`)
  try {
    await retryUntil(
      `Deleting Kubernetes Job ${name}`,
      () => deps.client.deleteJob(name),
      giveUpTime(createdAt, deps),
      deps
    )
  } catch (error) {
    logger.error(
      `Gave up deleting Kubernetes Job ${name}; its deadline has passed: ${getErrorMessage(error)}`
    )
  }
  throw new JobCancelledError(`Kubernetes Job ${name} ${reason}`)
}

const jobCreatedAt = (job: { metadata?: { creationTimestamp?: Date } }) =>
  job.metadata?.creationTimestamp
    ? new Date(job.metadata.creationTimestamp)
    : undefined

const waitForJob = async (
  queue: K8sQueue,
  MQjob: BullMQJob,
  jobid: string,
  name: string,
  deps: Deps
): Promise<void> => {
  const signal = currentAbortSignal()
  let createdAt: Date | undefined
  let warnedPending = false
  let pollErrors = 0

  for (;;) {
    if (signal?.aborted) await cancel(name, createdAt, deps, 'cancelled')

    // A deleted document means a deleted job, even if its cancel message
    // never arrived. A MongoDB hiccup just skips this check.
    let dbJob: DBJobFields | null | undefined
    try {
      dbJob = await loadJob(queue, jobid)
    } catch (error) {
      logger.warn(`Loading job ${jobid} failed: ${getErrorMessage(error)}`)
    }
    if (dbJob === null) await cancel(name, createdAt, deps, 'deleted')

    let job
    let pods
    try {
      job = await deps.client.readJob(name)
      pods = job ? await deps.client.listJobPods(name) : []
      pollErrors = 0
    } catch (error) {
      // Keep watching through API outages: the pod carries on without us.
      // Give up only once the Job's deadline has certainly stopped it.
      pollErrors++
      if (deps.now().getTime() >= giveUpTime(createdAt, deps)) throw error
      const delay = Math.min(
        deps.settings.pollIntervalMs * 2 ** (pollErrors - 1),
        MAX_RETRY_DELAY_MS
      )
      logger.warn(
        `Polling Kubernetes Job ${name} failed (${pollErrors} in a row), retrying in ${Math.round(delay / 1000)} s: ${getErrorMessage(error)}`
      )
      await deps.sleep(delay, signal)
      continue
    }

    if (!job) {
      // Deleted by hand, or removed by its TTL while the dispatcher was down.
      // The pod records a finished job in MongoDB, so that has the outcome.
      const status = dbJob?.status ?? (await loadJob(queue, jobid))?.status
      if (status === 'Completed') return
      throw new Error(
        `Kubernetes Job ${name} disappeared before the job finished (status ${status})`
      )
    }
    createdAt ??= jobCreatedAt(job)

    const state = classifyJob(job, pods, deps.now(), deps.settings)
    switch (state.phase) {
      case 'succeeded':
        logger.info(`Kubernetes Job ${name} succeeded`)
        return
      case 'failed':
        // Config and image-pull errors are seen while the Job is still
        // live; stop it so a later attempt can't adopt it and it can't start
        // after the failure is reported. Finished Jobs stay for their logs.
        if (!isFinished(job)) {
          logger.info(`Deleting failed Kubernetes Job ${name}: ${state.reason}`)
          await deleteAndWait(name, deps, giveUpTime(createdAt, deps))
        }
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
  const { jobid, type, uuid } = MQjob.data as JobData
  if (!jobid) throw new Error(`BullMQ job ${MQjob.id} has no jobid`)
  if (!MQjob.id) throw new Error('BullMQ job has no id')

  const dbJob = await loadJob(queue, jobid)
  if (!dbJob) {
    // Deleted while queued or while the dispatcher was down. Stop any Job
    // still running for it, found by the uuid BullMQ kept.
    if (uuid) {
      // cancel() always throws (JobCancelledError); deleting a missing Job is
      // a no-op
      await cancel(jobName(queue, uuid), undefined, deps, 'deleted').catch(
        () => undefined
      )
    }
    throw new JobDeletedError(`No job found for: ${jobid}`)
  }

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

  if ((await submit(queue, MQjob, manifest, dbJob, deps)) === 'watching') {
    await waitForJob(queue, MQjob, jobid, name, deps)
  }
}

export const processBilboMDJobK8s = (MQjob: BullMQJob) =>
  runJobOnK8s('bilbomd', MQjob)

export const processMultiMDJobK8s = (MQjob: BullMQJob) =>
  runJobOnK8s('multimd', MQjob)
