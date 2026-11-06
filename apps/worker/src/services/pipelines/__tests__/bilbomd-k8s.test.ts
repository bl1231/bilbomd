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
import { needsGpu, runJobOnK8s } from '../bilbomd-k8s.js'

const settings: K8sSettings = {
  namespace: 'bilbomd',
  jobImage: 'worker:test',
  imagePullPolicy: 'IfNotPresent',
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
  imagePullGraceMs: 5 * 60_000
}

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const NAME = `bilbomd-${UUID}`

const complete: V1Job = {
  status: { conditions: [{ type: 'Complete', status: 'True' }] }
}
const running: V1Job = { status: { active: 1 } }
const failed: V1Job = {
  status: { conditions: [{ type: 'Failed', status: 'True' }] }
}
const runningPod: V1Pod = { status: { phase: 'Running' } }
const failedPod: V1Pod = {
  status: {
    phase: 'Failed',
    containerStatuses: [
      {
        name: 'bilbomd',
        state: { terminated: { exitCode: 1, message: 'MultiFoXS failed' } },
        image: '',
        imageID: '',
        ready: false,
        restartCount: 0
      }
    ]
  }
}

// A fake cluster: readJob returns the given states in turn (the last repeats)
const fakeClient = (
  states: (V1Job | null | Error)[],
  pods: V1Pod[] = [runningPod]
) => {
  let i = 0
  const next = () => states[Math.min(i++, states.length - 1)]
  const client = {
    createJob: vi.fn(async () => true),
    readJob: vi.fn(async () => {
      const s = next()
      if (s instanceof Error) throw s
      return s
    }),
    listJobPods: vi.fn(async () => pods),
    deleteJob: vi.fn(async () => {})
  } satisfies K8sJobClient
  return client
}

let clock = new Date('2026-11-05T12:00:00Z')
const deps = (client: K8sJobClient) => ({
  client,
  settings,
  now: () => clock,
  sleep: vi.fn(async (ms: number) => {
    clock = new Date(clock.getTime() + ms)
  })
})

const mqJob = (data: Record<string, unknown> = {}, attemptsMade = 0) =>
  ({
    id: '42',
    attemptsMade,
    data: { type: 'pdb', jobid: 'mongo-1', ...data },
    log: vi.fn(async () => 0)
  }) as unknown as BullMQJob & { log: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.clearAllMocks()
  clock = new Date('2026-11-05T12:00:00Z')
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

describe('runJobOnK8s', () => {
  it('creates the Job and returns once it completes', async () => {
    const client = fakeClient([running, running, complete])
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    expect(client.createJob).toHaveBeenCalledTimes(1)
    const body = client.createJob.mock.calls[0][0] as V1Job
    expect(body.metadata!.name).toBe(NAME)
    expect(body.metadata!.labels![LABELS.gpu]).toBe('true')
    expect(body.spec!.template.spec!.containers[0].command).toEqual([
      'node',
      'dist/run-job.js',
      'bilbomd',
      '42'
    ])
    expect(client.readJob).toHaveBeenCalledTimes(3)
    expect(MQ.log).toHaveBeenCalledWith(`Created Kubernetes Job ${NAME}`)
  })

  it('runs multi jobs on CPUs under their own name', async () => {
    const client = fakeClient([complete])

    await runJobOnK8s('multimd', mqJob({ type: 'multi' }), deps(client))

    const body = client.createJob.mock.calls[0][0] as V1Job
    expect(body.metadata!.name).toBe(`bilbomd-multi-${UUID}`)
    expect(body.metadata!.labels![LABELS.gpu]).toBe('false')
    expect(body.spec!.template.spec!.resourceClaims).toBeUndefined()
    expect(mocks.findMulti).toHaveBeenCalledWith('mongo-1')
  })

  it('throws the reason when the Job fails', async () => {
    const client = fakeClient([running, failed], [failedPod])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      `Kubernetes Job ${NAME} failed: MultiFoXS failed`
    )
  })

  it('adopts the Job of the same attempt after a dispatcher restart', async () => {
    const existing: V1Job = {
      metadata: { labels: { [LABELS.attempt]: '0' } },
      status: { active: 1 }
    }
    const client = fakeClient([existing, running, complete])
    client.createJob.mockResolvedValueOnce(false)
    const MQ = mqJob()

    await runJobOnK8s('bilbomd', MQ, deps(client))

    expect(client.createJob).toHaveBeenCalledTimes(1)
    expect(client.deleteJob).not.toHaveBeenCalled()
    expect(MQ.log).toHaveBeenCalledWith(
      `Watching existing Kubernetes Job ${NAME}`
    )
  })

  it("replaces an earlier attempt's finished Job when BullMQ retries", async () => {
    const earlier: V1Job = {
      metadata: { labels: { [LABELS.attempt]: '0' } },
      status: { conditions: [{ type: 'Failed', status: 'True' }] }
    }
    // read: the old Job, still there while it is deleted, gone, then the new one
    const client = fakeClient([earlier, earlier, null, complete])
    client.createJob.mockResolvedValueOnce(false)

    await runJobOnK8s('bilbomd', mqJob({}, 1), deps(client))

    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
    expect(client.createJob).toHaveBeenCalledTimes(2)
    const body = client.createJob.mock.calls[1][0] as V1Job
    expect(body.metadata!.labels![LABELS.attempt]).toBe('1')
  })

  it("keeps watching an earlier attempt's Job that is still running", async () => {
    const earlier: V1Job = {
      metadata: { labels: { [LABELS.attempt]: '0' } },
      status: { active: 1 }
    }
    const client = fakeClient([earlier, complete])
    client.createJob.mockResolvedValueOnce(false)

    await runJobOnK8s('bilbomd', mqJob({}, 1), deps(client))

    expect(client.deleteJob).not.toHaveBeenCalled()
  })

  it('deletes the Job when the job is cancelled', async () => {
    const client = fakeClient([running])
    const d = deps(client)
    d.sleep.mockImplementation(async () => {
      cancelRunningJob('mongo-1', 'deleted by user')
    })

    await expect(
      runCancellable('mongo-1', () => runJobOnK8s('bilbomd', mqJob(), d))
    ).rejects.toBeInstanceOf(JobCancelledError)
    expect(client.deleteJob).toHaveBeenCalledWith(NAME)
  })

  it('rides out a few failed API calls', async () => {
    const client = fakeClient([
      running,
      new Error('ECONNRESET'),
      new Error('ECONNRESET'),
      complete
    ])

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).resolves.toBeUndefined()
  })

  it('gives up after too many failed API calls in a row', async () => {
    const client = fakeClient([new Error('ECONNREFUSED')])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      'ECONNREFUSED'
    )
    expect(client.readJob).toHaveBeenCalledTimes(20)
  })

  it('accepts a vanished Job whose BilboMD job completed', async () => {
    const client = fakeClient([running, null])
    mocks.findJob
      .mockResolvedValueOnce({
        uuid: UUID,
        md_engine: 'OpenMM',
        status: 'Running'
      })
      .mockResolvedValueOnce({ uuid: UUID, status: 'Completed' })

    await expect(
      runJobOnK8s('bilbomd', mqJob(), deps(client))
    ).resolves.toBeUndefined()
  })

  it('fails when the Job vanishes before the BilboMD job finished', async () => {
    const client = fakeClient([running, null])

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
    const client = fakeClient([...Array(50).fill(running), complete], [pending])
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

  it('fails before creating anything when the MongoDB job is missing', async () => {
    mocks.findJob.mockResolvedValueOnce(null)
    const client = fakeClient([complete])

    await expect(runJobOnK8s('bilbomd', mqJob(), deps(client))).rejects.toThrow(
      'No job found for: mongo-1'
    )
    expect(client.createJob).not.toHaveBeenCalled()
  })
})
