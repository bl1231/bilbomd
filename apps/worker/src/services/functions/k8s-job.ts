import {
  ApiException,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  type V1Job,
  type V1Pod
} from '@kubernetes/client-node'
import { config } from '../../config/config.js'

// One Kubernetes Job per BilboMD job, for the k8s execution backend. The
// Job's pod runs `node dist/run-job.js <queue> <bullmq-job-id>` in the worker
// image: the same pipeline code as the local backend, against the same
// MongoDB and the shared job-directory volume. The dispatcher (the BullMQ
// worker) creates the Job, polls it until it finishes, and deletes it to
// cancel. See services/pipelines/bilbomd-k8s.ts.

export type K8sQueue = 'bilbomd' | 'multimd'
export type K8sSettings = typeof config.k8s

// Name of the container that runs the pipeline in a job pod
export const JOB_CONTAINER = 'bilbomd'

// AlphaFold/OpenFold jobs also get their structure-prediction service as a
// native sidecar (an init container with restartPolicy: Always) sharing the
// pod's GPU. It starts before the pipeline and stops when the pipeline exits.
export const FOLD_SIDECAR = 'fold-service'
export type FoldService = 'colabfold' | 'of3'
const FOLD_PORT = 8000
// Where the OpenFold3 sidecar finds its weights (OF3_DATA_DIR)
const OF3_DATA_MOUNT = '/of3_data'

export const LABELS = {
  uuid: 'bilbomd.lbl.gov/uuid',
  queue: 'bilbomd.lbl.gov/queue',
  gpu: 'bilbomd.lbl.gov/gpu',
  // The BullMQ attempt the Job belongs to. A retry of a failed attempt
  // replaces the Job; a dispatcher restart within an attempt adopts it.
  attempt: 'bilbomd.lbl.gov/attempt'
} as const

// The Job controller labels every pod it creates with this
const JOB_NAME_LABEL = 'batch.kubernetes.io/job-name'

// run-job's exit code for a job stopped by SIGTERM (see run-job.ts)
const EXIT_CANCELLED = 3

// Fixed names make submitting idempotent: a dispatcher that restarts mid-job
// finds the Job it created instead of starting a second one.
export const jobName = (queue: K8sQueue, uuid: string): string =>
  `${queue === 'multimd' ? 'bilbomd-multi' : 'bilbomd'}-${uuid.toLowerCase()}`

export interface JobManifestInput {
  queue: K8sQueue
  bullmqJobId: string
  uuid: string
  attempt: number
  needsGpu: boolean
  // Structure-prediction service the pipeline calls (AlphaFold/OpenFold jobs)
  foldService?: FoldService
}

// The pipeline's environment variable for each service's URL
const FOLD_SERVICE_URL_ENV: Record<FoldService, string> = {
  colabfold: 'COLABFOLD_SERVICE_URL',
  of3: 'OF3_SERVICE_URL'
}

const foldImage = (service: FoldService, settings: K8sSettings) =>
  service === 'colabfold'
    ? settings.foldSidecar.colabfoldImage
    : settings.foldSidecar.of3Image

const containerSecurityContext = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] }
}

const buildFoldSidecar = (
  service: FoldService,
  settings: K8sSettings,
  dataVol: string
) => ({
  name: FOLD_SIDECAR,
  image: foldImage(service, settings),
  imagePullPolicy: settings.imagePullPolicy,
  restartPolicy: 'Always',
  // The images bind 0.0.0.0, but Berkelium pods are IPv6-only: bind '::' so
  // the kubelet's probe (pod IPv6) and the pipeline's localhost (::1) reach
  // it. 127.0.0.1 is refused there, so the pipeline must use localhost.
  args: ['uvicorn', 'main:app', '--host', '::', '--port', String(FOLD_PORT)],
  env: [
    // The service reads job inputs from and writes outputs to <UPLOAD_DIR>/<uuid>
    { name: 'UPLOAD_DIR', value: dataVol },
    // Non-root: JAX/PyTorch caches go under $HOME
    { name: 'HOME', value: '/tmp' },
    ...(service === 'of3'
      ? [{ name: 'OF3_DATA_DIR', value: OF3_DATA_MOUNT }]
      : [])
  ],
  ports: [{ name: 'http', containerPort: FOLD_PORT }],
  // The pipeline container starts once this passes
  startupProbe: {
    httpGet: { path: '/health', port: FOLD_PORT },
    periodSeconds: 5,
    failureThreshold: 120
  },
  resources: {
    requests: { ...settings.foldSidecar.resources.requests },
    limits: { ...settings.foldSidecar.resources.limits },
    claims: [{ name: 'gpu' }]
  },
  securityContext: containerSecurityContext,
  volumeMounts: [
    { name: 'data', mountPath: dataVol, subPath: settings.dataSubPath },
    { name: 'tmp', mountPath: '/tmp' },
    { name: 'shm', mountPath: '/dev/shm' },
    ...(service === 'of3'
      ? [
          {
            name: 'data',
            mountPath: OF3_DATA_MOUNT,
            subPath: settings.foldSidecar.of3DataSubPath,
            readOnly: true
          }
        ]
      : [])
  ]
})

export const buildJobManifest = (
  {
    queue,
    bullmqJobId,
    uuid,
    attempt,
    needsGpu,
    foldService
  }: JobManifestInput,
  settings: K8sSettings = config.k8s,
  dataVol: string = config.uploadDir
): V1Job => {
  // The sidecar shares the pod's GPU claim, so it needs one; it's left out
  // when no image is configured (the pipeline then reports the service as
  // unreachable)
  const sidecar =
    foldService && needsGpu && foldImage(foldService, settings)
      ? foldService
      : undefined
  const labels = {
    'app.kubernetes.io/part-of': 'bilbomd',
    'app.kubernetes.io/component': 'job',
    [LABELS.uuid]: uuid.toLowerCase(),
    [LABELS.queue]: queue,
    [LABELS.gpu]: String(needsGpu),
    [LABELS.attempt]: String(attempt)
  }
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName(queue, uuid),
      namespace: settings.namespace,
      labels
    },
    spec: {
      // A pod failure fails the attempt; BullMQ decides about retries
      backoffLimit: 0,
      activeDeadlineSeconds: settings.activeDeadlineSeconds,
      ttlSecondsAfterFinished: settings.ttlSecondsAfterFinished,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          // The pod never talks to the Kubernetes API
          automountServiceAccountToken: false,
          // Time for run-job to stop its child processes on cancel
          terminationGracePeriodSeconds: 60,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: settings.runAsUser,
            runAsGroup: settings.runAsGroup,
            fsGroup: settings.runAsGroup,
            // Don't chown the whole shared volume on every pod start
            fsGroupChangePolicy: 'OnRootMismatch',
            seccompProfile: { type: 'RuntimeDefault' }
          },
          // Private images (e.g. harbor.bk.lbl.gov/bilbomd) need the same pull
          // secrets as the dispatcher; job pods don't use its ServiceAccount
          ...(settings.imagePullSecrets.length > 0
            ? {
                imagePullSecrets: settings.imagePullSecrets.map((name) => ({
                  name
                }))
              }
            : {}),
          ...(needsGpu
            ? {
                resourceClaims: [
                  {
                    name: 'gpu',
                    resourceClaimTemplateName: settings.gpuClaimTemplate
                  }
                ]
              }
            : {}),
          ...(sidecar
            ? { initContainers: [buildFoldSidecar(sidecar, settings, dataVol)] }
            : {}),
          containers: [
            {
              name: JOB_CONTAINER,
              image: settings.jobImage,
              imagePullPolicy: settings.imagePullPolicy,
              command: ['node', 'dist/run-job.js', queue, bullmqJobId],
              envFrom: [
                { configMapRef: { name: settings.configMapName } },
                { secretRef: { name: settings.secretName } }
              ],
              env: [
                // The pod runs the pipeline itself
                { name: 'EXECUTION_BACKEND', value: 'local' },
                // Nothing renders movies on Kubernetes yet
                { name: 'ENABLE_MOVIES', value: 'false' },
                // Many pods would fight over one rotating log file on the
                // shared volume; the console log is in `kubectl logs`
                { name: 'BILBOMD_LOGS', value: '/tmp/bilbomd-logs' },
                ...(sidecar
                  ? [
                      {
                        name: FOLD_SERVICE_URL_ENV[sidecar],
                        value: `http://localhost:${FOLD_PORT}`
                      }
                    ]
                  : [])
              ],
              resources: {
                requests: { ...settings.resources.requests },
                limits: { ...settings.resources.limits },
                ...(needsGpu ? { claims: [{ name: 'gpu' }] } : {})
              },
              // run-job writes why it failed here; fall back to the log tail
              terminationMessagePolicy: 'FallbackToLogsOnError',
              securityContext: containerSecurityContext,
              volumeMounts: [
                {
                  name: 'data',
                  mountPath: dataVol,
                  subPath: settings.dataSubPath
                },
                { name: 'tmp', mountPath: '/tmp' }
              ]
            }
          ],
          volumes: [
            {
              name: 'data',
              persistentVolumeClaim: { claimName: settings.dataPvc }
            },
            // Node-local scratch (Berkelium's rule for scratch space)
            { name: 'tmp', emptyDir: {} },
            ...(sidecar
              ? [
                  {
                    name: 'shm',
                    emptyDir: {
                      medium: 'Memory',
                      sizeLimit: settings.foldSidecar.shmSize
                    }
                  }
                ]
              : [])
          ]
        }
      }
    }
  }
}

export type JobState =
  | { phase: 'succeeded' }
  | { phase: 'failed'; reason: string }
  | { phase: 'pending'; reason: string; since?: Date }
  | { phase: 'running' }

const conditionIsTrue = (job: V1Job, type: string) =>
  job.status?.conditions?.find((c) => c.type === type && c.status === 'True')

const latestPod = (pods: V1Pod[]): V1Pod | undefined =>
  [...pods].sort(
    (a, b) =>
      new Date(b.metadata?.creationTimestamp ?? 0).getTime() -
      new Date(a.metadata?.creationTimestamp ?? 0).getTime()
  )[0]

const formatDuration = (seconds: number): string =>
  seconds % 3600 === 0
    ? `${seconds / 3600} h`
    : `${Math.round(seconds / 60)} min`

// Container errors Kubernetes won't recover from without a new pod spec
const CONFIG_ERRORS = new Set([
  'InvalidImageName',
  'CreateContainerConfigError',
  'CreateContainerError'
])
// Image pull errors can be transient (registry hiccup, slow first pull)
const IMAGE_PULL_ERRORS = new Set(['ErrImagePull', 'ImagePullBackOff'])

// Why a finished Job failed, from the most specific signal available
const failureReason = (job: V1Job, pod: V1Pod | undefined): string => {
  const failed =
    conditionIsTrue(job, 'Failed') ?? conditionIsTrue(job, 'FailureTarget')
  const container = pod?.status?.containerStatuses?.find(
    (c) => c.name === JOB_CONTAINER
  )
  const terminated =
    container?.state?.terminated ?? container?.lastState?.terminated

  if (terminated?.reason === 'OOMKilled') {
    const limit = job.spec?.template.spec?.containers[0]?.resources?.limits
    return `ran out of memory (limit ${limit?.memory ?? 'unknown'})`
  }
  // A sidecar killed for memory restarts; the pipeline then fails its
  // prediction step with a less helpful error
  const sidecar = pod?.status?.initContainerStatuses?.find(
    (c) => c.name === FOLD_SIDECAR
  )
  const sidecarTerminated =
    sidecar?.state?.terminated ?? sidecar?.lastState?.terminated
  if (sidecarTerminated?.reason === 'OOMKilled') {
    const limit = job.spec?.template.spec?.initContainers?.find(
      (c) => c.name === FOLD_SIDECAR
    )?.resources?.limits
    return `the structure-prediction service ran out of memory (limit ${limit?.memory ?? 'unknown'})`
  }
  if (failed?.reason === 'DeadlineExceeded') {
    const limit = job.spec?.activeDeadlineSeconds
    return limit
      ? `ran longer than its ${formatDuration(limit)} limit and was stopped`
      : 'ran past its deadline and was stopped'
  }
  if (pod?.status?.reason === 'Evicted') {
    return `pod was evicted: ${pod.status.message ?? 'no reason given'}`
  }
  const message = terminated?.message?.trim()
  if (terminated?.exitCode === EXIT_CANCELLED) {
    // A user cancel deletes the Job; this pod was stopped some other way
    // (e.g. a node drain)
    return `pod was stopped before it finished${message ? `: ${message}` : ''}`
  }
  if (message) return message
  if (terminated) return `pod exited with code ${terminated.exitCode}`
  return failed?.message ?? 'Kubernetes Job failed'
}

// Maps a Job and its pods onto what the dispatcher needs to know. The pod
// reports pipeline progress and step errors to MongoDB itself; this only
// covers what the pod can't report (OOM kills, deadlines, image pulls,
// scheduling).
export const classifyJob = (
  job: V1Job,
  pods: V1Pod[],
  now: Date,
  settings: Pick<K8sSettings, 'imagePullGraceMs'> = config.k8s
): JobState => {
  if (conditionIsTrue(job, 'Complete')) return { phase: 'succeeded' }

  const pod = latestPod(pods)
  if (conditionIsTrue(job, 'Failed') || conditionIsTrue(job, 'FailureTarget')) {
    return { phase: 'failed', reason: failureReason(job, pod) }
  }

  if (!pod) {
    return {
      phase: 'pending',
      reason: 'waiting for the Job controller to create a pod',
      since: job.metadata?.creationTimestamp
        ? new Date(job.metadata.creationTimestamp)
        : undefined
    }
  }

  const podCreated = pod.metadata?.creationTimestamp
    ? new Date(pod.metadata.creationTimestamp)
    : undefined
  // The sidecar's image (tens of GB) can fail to pull just like the job's
  const waiting =
    [
      ...(pod.status?.initContainerStatuses ?? []).filter(
        (c) => c.name === FOLD_SIDECAR
      ),
      ...(pod.status?.containerStatuses ?? []).filter(
        (c) => c.name === JOB_CONTAINER
      )
    ]
      .map((c) => c.state?.waiting)
      .find(
        (w) =>
          w?.reason &&
          (CONFIG_ERRORS.has(w.reason) || IMAGE_PULL_ERRORS.has(w.reason))
      ) ??
    pod.status?.containerStatuses?.find((c) => c.name === JOB_CONTAINER)?.state
      ?.waiting
  if (waiting?.reason && CONFIG_ERRORS.has(waiting.reason)) {
    return {
      phase: 'failed',
      reason: `${waiting.reason}: ${waiting.message ?? 'no details'}`
    }
  }
  if (waiting?.reason && IMAGE_PULL_ERRORS.has(waiting.reason)) {
    // Pulling starts once the pod is on a node, so time spent waiting for a
    // GPU doesn't use up the grace period
    const scheduled = pod.status?.conditions?.find(
      (c) => c.type === 'PodScheduled' && c.status === 'True'
    )
    const pullStarted = scheduled?.lastTransitionTime
      ? new Date(scheduled.lastTransitionTime)
      : podCreated
    const waited = pullStarted ? now.getTime() - pullStarted.getTime() : 0
    if (waited >= settings.imagePullGraceMs) {
      return {
        phase: 'failed',
        reason: `could not pull the job image: ${waiting.message ?? waiting.reason}`
      }
    }
  }

  if (pod.status?.phase === 'Pending') {
    const scheduled = pod.status.conditions?.find(
      (c) => c.type === 'PodScheduled'
    )
    if (scheduled?.status === 'False') {
      return {
        phase: 'pending',
        reason:
          `not scheduled (${scheduled.reason ?? 'unknown'}): ${scheduled.message ?? ''}`.trim(),
        since: podCreated
      }
    }
    return {
      phase: 'pending',
      reason: waiting?.reason ?? 'starting',
      since: podCreated
    }
  }

  // Running, or finished with the Job status not yet updated
  return { phase: 'running' }
}

// Whether the Job's pods have stopped. FailureTarget means the Job will fail
// but its pods may still be terminating, so it doesn't count.
export const isFinished = (job: V1Job): boolean =>
  Boolean(conditionIsTrue(job, 'Complete') || conditionIsTrue(job, 'Failed'))

// The few Kubernetes calls the dispatcher makes, so they can be faked in
// tests. The dispatcher's ServiceAccount may create, get, list, watch and
// delete Jobs and get, list and watch pods (Berkelium RBAC).
export interface K8sJobClient {
  // false if a Job with that name already exists
  createJob: (job: V1Job) => Promise<boolean>
  // null if there is no such Job
  readJob: (name: string) => Promise<V1Job | null>
  listJobPods: (name: string) => Promise<V1Pod[]>
  // Names of the queue's Jobs that haven't finished (including ones being
  // deleted, whose pods may still be running)
  listActiveJobs: (queue: K8sQueue) => Promise<string[]>
  // Starts deleting the Job. Deletion is in the foreground: the Job stays
  // readable until its pods are gone, so waiting for readJob to return null
  // waits for the pods to stop. A missing Job is fine.
  deleteJob: (name: string) => Promise<void>
}

const isStatus = (error: unknown, code: number) =>
  error instanceof ApiException && error.code === code

export const createK8sJobClient = (
  namespace: string = config.k8s.namespace,
  kubeConfig?: KubeConfig
): K8sJobClient => {
  const kc = kubeConfig ?? new KubeConfig()
  // In a pod this uses the ServiceAccount token; elsewhere ~/.kube/config
  if (!kubeConfig) kc.loadFromDefault()
  const batch = kc.makeApiClient(BatchV1Api)
  const core = kc.makeApiClient(CoreV1Api)

  return {
    createJob: async (body) => {
      try {
        await batch.createNamespacedJob({ namespace, body })
        return true
      } catch (error) {
        if (isStatus(error, 409)) return false
        throw error
      }
    },
    readJob: async (name) => {
      try {
        return await batch.readNamespacedJob({ name, namespace })
      } catch (error) {
        if (isStatus(error, 404)) return null
        throw error
      }
    },
    listJobPods: async (name) => {
      const list = await core.listNamespacedPod({
        namespace,
        labelSelector: `${JOB_NAME_LABEL}=${name}`
      })
      return list.items
    },
    listActiveJobs: async (queue) => {
      const list = await batch.listNamespacedJob({
        namespace,
        labelSelector: `app.kubernetes.io/component=job,${LABELS.queue}=${queue}`
      })
      return list.items
        .filter((job) => !isFinished(job))
        .map((job) => job.metadata?.name ?? '')
        .filter(Boolean)
    },
    deleteJob: async (name) => {
      try {
        await batch.deleteNamespacedJob({
          name,
          namespace,
          propagationPolicy: 'Foreground'
        })
      } catch (error) {
        if (isStatus(error, 404)) return
        throw error
      }
    }
  }
}
