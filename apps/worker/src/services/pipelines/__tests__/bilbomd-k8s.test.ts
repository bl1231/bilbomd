import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job as BullMQJob } from 'bullmq'
import type { V1Job, V1Pod } from '@kubernetes/client-node'

const mocks = vi.hoisted(() => ({
  findJob: vi.fn(),
  findMulti: vi.fn()
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findById: (id: string) => ({ exec: () => mocks.findJob(id) }) },
  MultiJob: { findById: (id: string) => ({ exec: () => mocks.findMulti(id) }) }
}))
vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  cancelRunningJob,
  runCancellable,
  JobCancelledError
} from '../../../helpers/jobCancellation.js'
import {
  LABELS,
  type K8sJobClient,
  type K8sSettings
} from '../../functions/k8s-job.js'
import { foldServiceFor, needsGpu, runJobOnK8s } from '../bilbomd-k8s.js'

const settings: K8sSettings = {
  namespace: 'bilbomd',
  jobImage: 'worker:test',
  imagePullPolicy: 'IfNotPresent',
  imagePullSecrets: [],
  configMapName: 'bilbomd-config',
  secretName: 'bilbomd-secrets',
  dataPvc: 'bilbomd-data',
  dataSubPath: 'uploads',
  runAsUser: 1000,
  runAsGroup: 1000,
  resources: {
    requests: { cpu: '1', memory: '1Gi' },
    limits: { cpu: '2', memory: '2Gi' }
  },
  gpuClaimTemplate: 'bilbomd-gpu',
  maxJobs: 2,
  activeDeadlineSeconds: 3600,
  ttlSecondsAfterFinished: 3600,
  pollIntervalMs: 15_000,
  pendingWarnMs: 10 * 60_000,
  imagePullGraceMs: 5 * 60_000,
  foldSidecar: {
    colabfoldImage: 'colabfold:test',
    of3Image: 'of3:test',
    of3DataSubPath: 'of3-data',
    shmSize: '16Gi',
    resources: {
      requests: { cpu: '1', memory: '1Gi' },
      limits: { cpu: '2', memory: '2Gi' }
    }
  }
}

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const NAME = `bilbomd-${UUID}`

let clock = new Date('2026-11-05T12:00:00Z')

const withAttempt = (job: V1Job, attempt: number): V1Job => ({
  ...job,
  metadata: { ...job.metadata, labels: { [LABELS.attempt]: String(attempt) } }
})
const running: V1Job = { metadata: {}, status: { active: 1 } }
const complete: V1Job = {
  status: { conditions: [{ type: 'Complete', status: 'True' }] }
}
const failed: V1Job = {
  status: { conditions: [{ type: 'Failed', status: 'True' }] }
}
const failing: V1Job = {
  status: { conditions: [{ type: 'FailureTarget', status: 'True' }] }
}
const runningPod: V1Pod = { status: { phase: 'Running' } }
const container = (state: Record<string, unknown>) => ({
  name: 'bilbomd',
  state,
  image: '',
  imageID: '',
  ready: false,
  restartCount: 0
})
const failedPod: V1Pod = {
  status: {
    phase: 'Failed',
    containerStatuses: [
      container({ terminated: { exitCode: 1, message: 'MultiFoXS failed' } })
    ]
  }
}
const configErrorPod: V1Pod = {
  metadata: { creationTimestamp: clock },
  status: {
    phase: 'Pending',
    containerStatuses: [
      container({
        waiting: {
          reason: 'CreateContainerConfigError',
          message: 'secret "bilbomd-secrets" not found'
        }
      })
    ]
  }
}

// A fake cluster: readJob returns the given results in turn (the last
// repeats), so a test lists what the dispatcher sees on each read
const fakeClient = (
  reads: (V1Job | null | Error)[],
  pods: V1Pod[] = [runningPod]
) => {
  let i = 0
  return {
    createJob: vi.fn<K8sJobClient['createJob']>(async () => true),
    readJob: vi.fn<K8sJobClient['readJob']>(async () => {
      const result = reads[Math.min(i++, reads.length - 1)]
      if (result instanceof Error) throw result
      return result
    }),
    listJobPods: vi.fn<K8sJobClient['listJobPods']>(async () => pods),
    listActiveJobs: vi.fn<K8sJobClient['listActiveJobs']>(async () => []),
    deleteJob: vi.fn<K8sJobClient['deleteJob']>(async () => {})
  } satisfies K8sJobClient
}

const deps = (client: K8sJobClient, overrides: Partial<K8sSettings> = {}) => ({
  client,
  settings: { ...settings, ...overrides },
  now: () => clock,
  sleep: vi.fn(async (ms: number) => {
    clock = new Date(clock.getTime() + ms)
  })
})

const mqJob = (data: Record<string, unknown> = {}, attemptsMade = 0) =>
  ({
    id: '42',
    attemptsMade,
    data: { type: 'pdb', jobid: 'mongo-1', uuid: UUID, ...data },
    log: vi.fn(async () => 0)
  }) as unknown as BullMQJob & { log: ReturnType<typeof vi.fn> }

const created = (client: ReturnType<typeof fakeClient>, call = 0) =>
  client.createJob.mock.calls[call][0] as V1Job

beforeEach(() => {
  vi.clearAllMocks()
  clock = new Date('2026-11-05T12:00:00Z')
  mocks.findJob.mockReset()
  mocks.findJob.mockResolvedValue({
    uuid: UUID,
    md_engine: 'OpenMM',
    status: 'Running'
  })
  mocks.findMulti.mockResolvedValue({ uuid: UUID, status: 'Running' })
})

describe('needsGpu', () => {
  it('is true for OpenMM and structure prediction, false for CHARMM', () => {
    expect(needsGpu('pdb', 'OpenMM')).toBe(true)
    expect(needsGpu('auto', 'OpenMM')).toBe(true)
    expect(needsGpu('sans', 'OpenMM')).toBe(true)
    expect(needsGpu('alphafold', undefined)).toBe(true)
    expect(needsGpu('openfold', undefined)).toBe(true)
    expect(needsGpu('pdb', 'CHARMM')).toBe(false)
    expect(needsGpu('pdb', undefined)).toBe(false)
    expect(needsGpu('crd_psf', 'OpenMM')).toBe(false)
  })
})

describe('foldServiceFor', () => {
  it('maps the structure-prediction job types to their service', () => {
    expect(foldServiceFor('alphafold')).toBe('colabfold')
    expect(foldServiceFor('openfold')).toBe('of3')
    expect(foldServiceFor('auto')).toBeUndefined()
    expect(foldServiceFor(undefined)).toBeUndefined()
  })
})

describe('runJobOnK8s: submitting', () => {
  it('creates the Job and returns once it completes', async () => {
    const client = fakeClient([null, running, running, complete])
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    expect(client.createJob).toHaveBeenCalledTimes(1)
    const body = created(client)
    expect(body.metadata!.name).toBe(NAME)
    expect(body.metadata!.labels![LABELS.gpu]).toBe('true')
    expect(body.spec!.template.spec!.containers[0].command).toEqual([
      'node',
      'dist/run-job.js',
      'bilbomd',
      '42'
    ])
    expect(MQ.log).toHaveBeenCalledWith(`Created Kubernetes Job ${NAME}`)
  })

  it('runs multi jobs on CPUs under their own name', async () => {
    const client = fakeClient([null, complete])

    await runJobOnK8s('multimd', mqJob({ type: 'multi' }), deps(client))

    const body = created(client)
    expect(body.metadata!.name).toBe(`bilbomd-multi-${UUID}`)
    expect(body.metadata!.labels![LABELS.gpu]).toBe('false')
    expect(body.spec!.template.spec!.resourceClaims).toBeUndefined()
    expect(mocks.findMulti).toHaveBeenCalledWith('mongo-1')
  })

  it('adopts the Job of the same attempt after a dispatcher restart', async () => {
    const client = fakeClient([withAttempt(running, 0), running, complete])
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    expect(client.createJob).not.toHaveBeenCalled()
    expect(client.deleteJob).not.toHaveBeenCalled()
    expect(MQ.log).toHaveBeenCalledWith(
      `Watching existing Kubernetes Job ${NAME}`
    )
  })

  it("replaces an earlier attempt's finished Job once its pods are gone", async () => {
    const earlier = withAttempt(failed, 0)
    // the old Job; still there while it is deleted; gone; the new one
    const client = fakeClient([earlier, earlier, null, complete])

    await runJobOnK8s('bilbomd', mqJob({}, 1), deps(client))

    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
    expect(client.readJob).toHaveBeenCalledTimes(4)
    expect(client.createJob).toHaveBeenCalledTimes(1)
    expect(created(client).metadata!.labels![LABELS.attempt]).toBe('1')
  })

  it("watches an earlier attempt's Job that is still running instead of starting another", async () => {
    const client = fakeClient([withAttempt(running, 0), complete])

    await runJobOnK8s('bilbomd', mqJob({}, 1), deps(client))

    expect(client.deleteJob).not.toHaveBeenCalled()
    expect(client.createJob).not.toHaveBeenCalled()
  })

  it('does not run a completed job again when its Job has expired', async () => {
    mocks.findJob.mockResolvedValue({ uuid: UUID, status: 'Completed' })
    const client = fakeClient([null])

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).resolves.toBeUndefined()

    expect(client.createJob).not.toHaveBeenCalled()
  })

  it('still watches an existing Job of a completed job', async () => {
    mocks.findJob.mockResolvedValue({ uuid: UUID, status: 'Completed' })
    const client = fakeClient([withAttempt(complete, 0)])

    await runJobOnK8s('bilbomd', mqJob(), deps(client))

    expect(client.readJob).toHaveBeenCalledTimes(2)
    expect(client.createJob).not.toHaveBeenCalled()
  })

  it('stops the Job of a job deleted while the dispatcher was down', async () => {
    mocks.findJob.mockResolvedValue(null)
    const client = fakeClient([withAttempt(running, 0)])

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).rejects.toBeInstanceOf(JobCancelledError)

    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
    expect(client.createJob).not.toHaveBeenCalled()
  })
})

describe('runJobOnK8s: the concurrency cap', () => {
  it('waits while the cap is taken by Jobs already running in the cluster', async () => {
    const client = fakeClient([null, complete])
    client.listActiveJobs
      .mockResolvedValueOnce(['bilbomd-a', 'bilbomd-b'])
      .mockResolvedValueOnce(['bilbomd-a', 'bilbomd-b'])
      .mockResolvedValueOnce(['bilbomd-a', NAME])
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    // Its own name doesn't count against the cap
    expect(client.listActiveJobs).toHaveBeenCalledTimes(3)
    expect(client.listActiveJobs).toHaveBeenCalledWith('bilbomd')
    expect(client.createJob).toHaveBeenCalledTimes(1)
    expect(MQ.log).toHaveBeenCalledWith(
      'Waiting to start: 2 bilbomd Kubernetes Jobs are running (limit 2)'
    )
  })

  it('caps multi jobs at one', async () => {
    const client = fakeClient([null, complete])
    client.listActiveJobs
      .mockResolvedValueOnce(['bilbomd-multi-other'])
      .mockResolvedValueOnce([])

    await runJobOnK8s('multimd', mqJob({ type: 'multi' }), deps(client))

    expect(client.listActiveJobs).toHaveBeenCalledWith('multimd')
    expect(client.listActiveJobs).toHaveBeenCalledTimes(2)
  })

  it('admits one new Job at a time, so two handlers cannot share the last slot', async () => {
    // A stateful fake: Jobs run for two polls, then complete
    const active = new Map<string, number>([['bilbomd-orphan', 0]])
    const maxAtCreate: number[] = []
    const client: K8sJobClient = {
      createJob: vi.fn(async (job: V1Job) => {
        maxAtCreate.push(active.size)
        active.set(job.metadata!.name!, 0)
        return true
      }),
      readJob: vi.fn(async (name: string) => {
        if (!active.has(name)) return null
        const polls = active.get(name)! + 1
        active.set(name, polls)
        if (polls > 2) {
          active.delete(name)
          return complete
        }
        return running
      }),
      listJobPods: vi.fn(async () => [runningPod]),
      listActiveJobs: vi.fn(async () => {
        // the orphan finishes after a while
        if (clock.getTime() > Date.parse('2026-11-05T12:01:00Z')) {
          active.delete('bilbomd-orphan')
        }
        return [...active.keys()]
      }),
      deleteJob: vi.fn(async () => {})
    }
    const d = deps(client)
    mocks.findJob.mockImplementation(async (id: string) => ({
      uuid: id === 'mongo-1' ? UUID : 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
      md_engine: 'OpenMM',
      status: 'Running'
    }))

    await Promise.all([
      runJobOnK8s('bilbomd', mqJob({ jobid: 'mongo-1' }), d),
      runJobOnK8s('bilbomd', mqJob({ jobid: 'mongo-2' }), d)
    ])

    expect(client.createJob).toHaveBeenCalledTimes(2)
    // Each new Job was created with fewer than the cap (2) already running
    expect(Math.max(...maxAtCreate)).toBeLessThan(2)
  })
})

describe('runJobOnK8s: failures', () => {
  it('throws the reason and keeps a finished Job for its logs', async () => {
    const client = fakeClient([null, running, failed], [failedPod])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      `Kubernetes Job ${NAME} failed: MultiFoXS failed`
    )
    expect(client.deleteJob).not.toHaveBeenCalled()
  })

  it('deletes a Job that failed before it finished and waits for its pods', async () => {
    // create; poll sees the config error; still there while deleting; gone
    const client = fakeClient([null, running, running, null], [configErrorPod])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      `Kubernetes Job ${NAME} failed: CreateContainerConfigError: secret "bilbomd-secrets" not found`
    )
    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
    expect(client.readJob).toHaveBeenCalledTimes(4)
  })

  it('waits for the pods of a Job that will fail (FailureTarget) before failing', async () => {
    const client = fakeClient(
      [withAttempt(failing, 0), failing, failing, null],
      [failedPod]
    )

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      'MultiFoXS failed'
    )
    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
    expect(client.readJob).toHaveBeenCalledTimes(4)
  })

  it('accepts a vanished Job whose BilboMD job completed', async () => {
    const client = fakeClient([null, running, null])
    mocks.findJob
      .mockResolvedValueOnce({ uuid: UUID, status: 'Running' }) // start
      .mockResolvedValueOnce({ uuid: UUID, status: 'Running' }) // poll 1
      .mockResolvedValueOnce({ uuid: UUID, status: 'Completed' }) // poll 2

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).resolves.toBeUndefined()
  })

  it('fails when the Job vanishes before the BilboMD job finished', async () => {
    const client = fakeClient([null, running, null])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      `Kubernetes Job ${NAME} disappeared before the job finished (status Running)`
    )
  })

  it('warns once when the pod waits too long to be scheduled', async () => {
    const pending: V1Pod = {
      metadata: { creationTimestamp: clock },
      status: {
        phase: 'Pending',
        conditions: [
          {
            type: 'PodScheduled',
            status: 'False',
            reason: 'Unschedulable',
            message: 'no GPU'
          }
        ]
      }
    }
    // 50 polls x 15 s = 12.5 min pending, then the Job completes
    const client = fakeClient(
      [null, ...Array(50).fill(running), complete],
      [pending]
    )
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    const warnings = MQ.log.mock.calls.filter(([m]) =>
      String(m).includes('still waiting')
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0][0]).toMatch(
      /still waiting after 10 min: not scheduled \(Unschedulable\): no GPU/
    )
  })
})

describe('runJobOnK8s: Kubernetes API outages', () => {
  it('keeps watching through a long outage', async () => {
    const outage = Array(40).fill(new Error('ECONNRESET'))
    const client = fakeClient([null, running, ...outage, complete])

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).resolves.toBeUndefined()
    expect(client.readJob).toHaveBeenCalledTimes(43)
  })

  it("gives up only after the Job's deadline has passed", async () => {
    const start = clock
    const client = fakeClient([
      null,
      { ...running, metadata: { creationTimestamp: start } },
      new Error('ECONNREFUSED')
    ])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      'ECONNREFUSED'
    )
    // 1 h deadline + 15 min margin
    expect(clock.getTime() - start.getTime()).toBeGreaterThanOrEqual(
      75 * 60_000
    )
  })
})

describe('runJobOnK8s: cancelling', () => {
  it('deletes the Job when the job is cancelled', async () => {
    const client = fakeClient([null, running])
    const d = deps(client)
    d.sleep.mockImplementation(async () => {
      cancelRunningJob('mongo-1', 'deleted by user')
    })

    await expect(
      runCancellable('mongo-1', () => runJobOnK8s('bilbomd', mqJob(), d))
    ).rejects.toBeInstanceOf(JobCancelledError)
    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
  })

  it('retries the delete until the Kubernetes API accepts it', async () => {
    const client = fakeClient([null, running])
    client.deleteJob
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
    const d = deps(client)
    let cancelled = false
    d.sleep.mockImplementation(async (ms: number) => {
      clock = new Date(clock.getTime() + ms)
      if (!cancelled) {
        cancelled = true
        cancelRunningJob('mongo-1', 'deleted by user')
      }
    })

    await expect(
      runCancellable('mongo-1', () => runJobOnK8s('bilbomd', mqJob(), d))
    ).rejects.toBeInstanceOf(JobCancelledError)
    expect(client.deleteJob).toHaveBeenCalledTimes(3)
  })

  it('stops the Job when its document is deleted while it runs', async () => {
    const client = fakeClient([null, running, running])
    mocks.findJob
      .mockResolvedValueOnce({ uuid: UUID, status: 'Running' }) // start
      .mockResolvedValueOnce({ uuid: UUID, status: 'Running' }) // poll 1
      .mockResolvedValue(null) // deleted

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).rejects.toBeInstanceOf(JobCancelledError)
    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
  })
})
