import { describe, it, expect, vi } from 'vitest'
import {
  ApiException,
  BatchV1Api,
  CoreV1Api,
  type KubeConfig,
  type V1Job,
  type V1Pod
} from '@kubernetes/client-node'
import {
  buildJobManifest,
  classifyJob,
  createK8sJobClient,
  isFinished,
  jobName,
  LABELS,
  type K8sSettings
} from '../k8s-job.js'

const settings: K8sSettings = {
  namespace: 'bilbomd',
  jobImage: 'harbor.example/bilbomd-worker:2.22.0',
  imagePullPolicy: 'IfNotPresent',
  configMapName: 'bilbomd-config',
  secretName: 'bilbomd-secrets',
  dataPvc: 'bilbomd-data',
  dataSubPath: 'uploads',
  runAsUser: 62704,
  runAsGroup: 1001,
  resources: {
    requests: { cpu: '4', memory: '8Gi' },
    limits: { cpu: '8', memory: '16Gi' }
  },
  gpuClaimTemplate: 'bilbomd-gpu',
  maxJobs: 2,
  activeDeadlineSeconds: 12 * 3600,
  ttlSecondsAfterFinished: 86400,
  pollIntervalMs: 15_000,
  pendingWarnMs: 600_000,
  imagePullGraceMs: 300_000
}

const UUID = '0F8FAD5B-D9CB-469F-A165-70867728950E'

const manifest = (
  needsGpu: boolean,
  queue: 'bilbomd' | 'multimd' = 'bilbomd'
) =>
  buildJobManifest(
    { queue, bullmqJobId: '42', uuid: UUID, attempt: 1, needsGpu },
    settings,
    '/bilbomd/uploads'
  )

describe('jobName', () => {
  it('is fixed per job, lowercase, and fits a label value', () => {
    expect(jobName('bilbomd', UUID)).toBe(
      'bilbomd-0f8fad5b-d9cb-469f-a165-70867728950e'
    )
    const multi = jobName('multimd', UUID)
    expect(multi).toBe('bilbomd-multi-0f8fad5b-d9cb-469f-a165-70867728950e')
    expect(multi.length).toBeLessThanOrEqual(63)
  })
})

describe('buildJobManifest', () => {
  it('runs run-job for the BullMQ job in the worker image', () => {
    const job = manifest(false)
    const pod = job.spec!.template.spec!
    const container = pod.containers[0]

    expect(job.metadata!.name).toBe(jobName('bilbomd', UUID))
    expect(job.metadata!.namespace).toBe('bilbomd')
    expect(container.image).toBe(settings.jobImage)
    expect(container.command).toEqual([
      'node',
      'dist/run-job.js',
      'bilbomd',
      '42'
    ])
    expect(container.envFrom).toEqual([
      { configMapRef: { name: 'bilbomd-config' } },
      { secretRef: { name: 'bilbomd-secrets' } }
    ])
    expect(container.env).toEqual(
      expect.arrayContaining([
        { name: 'EXECUTION_BACKEND', value: 'local' },
        { name: 'ENABLE_MOVIES', value: 'false' }
      ])
    )
  })

  it('fails once, on a deadline, and cleans up after itself', () => {
    const spec = manifest(false).spec!
    expect(spec.backoffLimit).toBe(0)
    expect(spec.activeDeadlineSeconds).toBe(43200)
    expect(spec.ttlSecondsAfterFinished).toBe(86400)
    expect(spec.template.spec!.restartPolicy).toBe('Never')
  })

  it('meets Berkelium policy: requests and limits, no API token, non-root', () => {
    const pod = manifest(false).spec!.template.spec!
    const container = pod.containers[0]

    expect(container.resources!.requests).toEqual({ cpu: '4', memory: '8Gi' })
    expect(container.resources!.limits).toEqual({ cpu: '8', memory: '16Gi' })
    expect(pod.automountServiceAccountToken).toBe(false)
    expect(pod.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 62704,
      runAsGroup: 1001,
      fsGroup: 1001
    })
    expect(container.securityContext).toEqual({
      allowPrivilegeEscalation: false,
      capabilities: { drop: ['ALL'] }
    })
    expect(pod.volumes).toContainEqual({ name: 'tmp', emptyDir: {} })
  })

  it('mounts the job directories at DATA_VOL', () => {
    const pod = manifest(false).spec!.template.spec!
    expect(pod.containers[0].volumeMounts).toContainEqual({
      name: 'data',
      mountPath: '/bilbomd/uploads',
      subPath: 'uploads'
    })
    expect(pod.volumes).toContainEqual({
      name: 'data',
      persistentVolumeClaim: { claimName: 'bilbomd-data' }
    })
  })

  it('claims a GPU only when the job needs one', () => {
    const cpu = manifest(false).spec!.template.spec!
    expect(cpu.resourceClaims).toBeUndefined()
    expect(cpu.containers[0].resources!.claims).toBeUndefined()

    const gpu = manifest(true).spec!.template.spec!
    expect(gpu.resourceClaims).toEqual([
      { name: 'gpu', resourceClaimTemplateName: 'bilbomd-gpu' }
    ])
    expect(gpu.containers[0].resources!.claims).toEqual([{ name: 'gpu' }])
  })

  it('labels the Job and pod with the job, queue, GPU and attempt', () => {
    const job = manifest(true, 'multimd')
    const expected = {
      [LABELS.uuid]: UUID.toLowerCase(),
      [LABELS.queue]: 'multimd',
      [LABELS.gpu]: 'true',
      [LABELS.attempt]: '1'
    }
    expect(job.metadata!.labels).toMatchObject(expected)
    expect(job.spec!.template.metadata!.labels).toMatchObject(expected)
  })
})

const NOW = new Date('2026-11-05T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

const jobWith = (
  conditions: {
    type: string
    status?: string
    reason?: string
    message?: string
  }[] = []
): V1Job => ({
  metadata: { name: 'bilbomd-x', creationTimestamp: minutesAgo(1) },
  spec: {
    activeDeadlineSeconds: 12 * 3600,
    template: {
      spec: {
        containers: [
          { name: 'bilbomd', resources: { limits: { memory: '16Gi' } } }
        ]
      }
    }
  },
  status: {
    conditions: conditions.map((c) => ({ status: 'True', ...c }))
  }
})

const podWith = (status: V1Pod['status'], createdMinutesAgo = 1): V1Pod => ({
  metadata: { creationTimestamp: minutesAgo(createdMinutesAgo) },
  status
})

const terminatedPod = (terminated: Record<string, unknown>) =>
  podWith({
    phase: 'Failed',
    containerStatuses: [
      {
        name: 'bilbomd',
        state: { terminated: { exitCode: 1, ...terminated } },
        image: '',
        imageID: '',
        ready: false,
        restartCount: 0
      }
    ]
  })

const waitingPod = (
  reason: string,
  createdMinutesAgo = 1,
  message = 'details'
) =>
  podWith(
    {
      phase: 'Pending',
      containerStatuses: [
        {
          name: 'bilbomd',
          state: { waiting: { reason, message } },
          image: '',
          imageID: '',
          ready: false,
          restartCount: 0
        }
      ]
    },
    createdMinutesAgo
  )

describe('classifyJob', () => {
  it('reports a completed Job as succeeded', () => {
    expect(
      classifyJob(jobWith([{ type: 'Complete' }]), [], NOW, settings)
    ).toEqual({ phase: 'succeeded' })
  })

  it('ignores conditions that are not True', () => {
    const job = jobWith([{ type: 'Complete', status: 'False' }])
    expect(classifyJob(job, [], NOW, settings).phase).toBe('pending')
  })

  it('uses the termination message run-job wrote', () => {
    const state = classifyJob(
      jobWith([{ type: 'Failed', reason: 'BackoffLimitExceeded' }]),
      [terminatedPod({ message: 'CHARMM exited 1\n' })],
      NOW,
      settings
    )
    expect(state).toEqual({ phase: 'failed', reason: 'CHARMM exited 1' })
  })

  it('treats FailureTarget like Failed', () => {
    const state = classifyJob(
      jobWith([{ type: 'FailureTarget' }]),
      [terminatedPod({ message: 'boom' })],
      NOW,
      settings
    )
    expect(state).toEqual({ phase: 'failed', reason: 'boom' })
  })

  it('explains an OOM kill with the memory limit', () => {
    const state = classifyJob(
      jobWith([{ type: 'Failed' }]),
      [terminatedPod({ reason: 'OOMKilled', exitCode: 137 })],
      NOW,
      settings
    )
    expect(state).toEqual({
      phase: 'failed',
      reason: 'ran out of memory (limit 16Gi)'
    })
  })

  it('explains a deadline', () => {
    const state = classifyJob(
      jobWith([{ type: 'Failed', reason: 'DeadlineExceeded' }]),
      [],
      NOW,
      settings
    )
    expect(state).toEqual({
      phase: 'failed',
      reason: 'ran longer than its 12 h limit and was stopped'
    })
  })

  it('explains an eviction', () => {
    const pod = podWith({
      phase: 'Failed',
      reason: 'Evicted',
      message: 'The node was low on resource: ephemeral-storage.'
    })
    const state = classifyJob(
      jobWith([{ type: 'Failed' }]),
      [pod],
      NOW,
      settings
    )
    expect(state).toEqual({
      phase: 'failed',
      reason:
        'pod was evicted: The node was low on resource: ephemeral-storage.'
    })
  })

  it('says a pod stopped by SIGTERM was not cancelled by the user', () => {
    const state = classifyJob(
      jobWith([{ type: 'Failed' }]),
      [terminatedPod({ exitCode: 3, message: 'Job cancelled: SIGTERM' })],
      NOW,
      settings
    )
    expect(state).toEqual({
      phase: 'failed',
      reason: 'pod was stopped before it finished: Job cancelled: SIGTERM'
    })
  })

  it('falls back to the exit code, then the Job condition', () => {
    expect(
      classifyJob(
        jobWith([{ type: 'Failed' }]),
        [terminatedPod({ exitCode: 1 })],
        NOW,
        settings
      )
    ).toEqual({ phase: 'failed', reason: 'pod exited with code 1' })
    expect(
      classifyJob(
        jobWith([
          {
            type: 'Failed',
            message: 'Job has reached the specified backoff limit'
          }
        ]),
        [],
        NOW,
        settings
      )
    ).toEqual({
      phase: 'failed',
      reason: 'Job has reached the specified backoff limit'
    })
  })

  it('uses the newest pod', () => {
    const old = { ...terminatedPod({ message: 'old' }) }
    old.metadata = { creationTimestamp: minutesAgo(30) }
    const latest = terminatedPod({ message: 'new' })
    const state = classifyJob(
      jobWith([{ type: 'Failed' }]),
      [latest, old],
      NOW,
      settings
    )
    expect(state).toEqual({ phase: 'failed', reason: 'new' })
  })

  it('is pending until the Job has a pod', () => {
    const state = classifyJob(jobWith(), [], NOW, settings)
    expect(state).toMatchObject({ phase: 'pending', since: minutesAgo(1) })
  })

  it('reports an unschedulable pod (e.g. no free GPU) as pending', () => {
    const pod = podWith(
      {
        phase: 'Pending',
        conditions: [
          {
            type: 'PodScheduled',
            status: 'False',
            reason: 'Unschedulable',
            message: '0/12 nodes are available: insufficient GPUs.'
          }
        ]
      },
      20
    )
    expect(classifyJob(jobWith(), [pod], NOW, settings)).toEqual({
      phase: 'pending',
      reason:
        'not scheduled (Unschedulable): 0/12 nodes are available: insufficient GPUs.',
      since: minutesAgo(20)
    })
  })

  it('fails at once on a container config error', () => {
    const state = classifyJob(
      jobWith(),
      [
        waitingPod(
          'CreateContainerConfigError',
          1,
          'secret "bilbomd-secrets" not found'
        )
      ],
      NOW,
      settings
    )
    expect(state).toEqual({
      phase: 'failed',
      reason: 'CreateContainerConfigError: secret "bilbomd-secrets" not found'
    })
  })

  it('gives an image pull a grace period, then fails', () => {
    const young = classifyJob(
      jobWith(),
      [waitingPod('ImagePullBackOff', 2)],
      NOW,
      settings
    )
    expect(young).toMatchObject({
      phase: 'pending',
      reason: 'ImagePullBackOff'
    })

    const old = classifyJob(
      jobWith(),
      [waitingPod('ErrImagePull', 6, 'manifest unknown')],
      NOW,
      settings
    )
    expect(old).toEqual({
      phase: 'failed',
      reason: 'could not pull the job image: manifest unknown'
    })
  })

  it('reports a running pod as running', () => {
    const pod = podWith({ phase: 'Running' })
    expect(classifyJob(jobWith(), [pod], NOW, settings)).toEqual({
      phase: 'running'
    })
  })
})

describe('isFinished', () => {
  it('is true for Complete, Failed and FailureTarget', () => {
    expect(isFinished(jobWith([{ type: 'Complete' }]))).toBe(true)
    expect(isFinished(jobWith([{ type: 'Failed' }]))).toBe(true)
    expect(isFinished(jobWith([{ type: 'FailureTarget' }]))).toBe(true)
    expect(isFinished(jobWith([{ type: 'Suspended' }]))).toBe(false)
    expect(isFinished(jobWith())).toBe(false)
  })
})

describe('createK8sJobClient', () => {
  const setup = () => {
    const batch = {
      createNamespacedJob: vi.fn(),
      readNamespacedJob: vi.fn(),
      deleteNamespacedJob: vi.fn()
    }
    const core = { listNamespacedPod: vi.fn() }
    const kc = {
      makeApiClient: (api: unknown) =>
        api === BatchV1Api ? batch : api === CoreV1Api ? core : undefined
    } as unknown as KubeConfig
    return { batch, core, client: createK8sJobClient('bilbomd', kc) }
  }
  const apiError = (code: number) => new ApiException(code, 'error', {}, {})

  it('creates a Job, or reports that it already exists', async () => {
    const { batch, client } = setup()
    const body = manifest(false)
    batch.createNamespacedJob.mockResolvedValueOnce(body)
    await expect(client.createJob(body)).resolves.toBe(true)
    expect(batch.createNamespacedJob).toHaveBeenCalledWith({
      namespace: 'bilbomd',
      body
    })

    batch.createNamespacedJob.mockRejectedValueOnce(apiError(409))
    await expect(client.createJob(body)).resolves.toBe(false)

    batch.createNamespacedJob.mockRejectedValueOnce(apiError(403))
    await expect(client.createJob(body)).rejects.toThrow()
  })

  it('reads a Job, with null for a missing one', async () => {
    const { batch, client } = setup()
    batch.readNamespacedJob.mockResolvedValueOnce({ metadata: { name: 'a' } })
    await expect(client.readJob('a')).resolves.toEqual({
      metadata: { name: 'a' }
    })

    batch.readNamespacedJob.mockRejectedValueOnce(apiError(404))
    await expect(client.readJob('a')).resolves.toBeNull()

    batch.readNamespacedJob.mockRejectedValueOnce(apiError(500))
    await expect(client.readJob('a')).rejects.toThrow()
  })

  it("lists the Job's pods by the Job controller's label", async () => {
    const { core, client } = setup()
    core.listNamespacedPod.mockResolvedValueOnce({ items: [{ metadata: {} }] })
    await expect(client.listJobPods('bilbomd-x')).resolves.toHaveLength(1)
    expect(core.listNamespacedPod).toHaveBeenCalledWith({
      namespace: 'bilbomd',
      labelSelector: 'batch.kubernetes.io/job-name=bilbomd-x'
    })
  })

  it('deletes a Job with its pods, ignoring a missing one', async () => {
    const { batch, client } = setup()
    batch.deleteNamespacedJob.mockResolvedValueOnce({})
    await client.deleteJob('bilbomd-x')
    expect(batch.deleteNamespacedJob).toHaveBeenCalledWith({
      name: 'bilbomd-x',
      namespace: 'bilbomd',
      propagationPolicy: 'Background'
    })

    batch.deleteNamespacedJob.mockRejectedValueOnce(apiError(404))
    await expect(client.deleteJob('bilbomd-x')).resolves.toBeUndefined()

    batch.deleteNamespacedJob.mockRejectedValueOnce(apiError(403))
    await expect(client.deleteJob('bilbomd-x')).rejects.toThrow()
  })
})
