import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job, UnrecoverableError } from 'bullmq'
import {
  cancelRunningJob,
  currentAbortSignal
} from '../../helpers/jobCancellation.js'

vi.mock('../../config/config.js', () => ({ config: { runOnNERSC: false } }))
vi.mock('../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../services/pipelines/bilbomd-pdb.js', () => ({
  processBilboMDPDBJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-crd.js', () => ({
  processBilboMDCRDJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-auto.js', () => ({
  processBilboMDAutoJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-sans.js', () => ({
  processBilboMDSANSJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-nersc.js', () => ({
  processBilboMDJobNersc: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-alphafold.js', () => ({
  processBilboMDAlphaFoldJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-openfold.js', () => ({
  processBilboMDOpenFoldJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-multi.js', () => ({
  processMultiMDJob: vi.fn()
}))
vi.mock('../../services/pipelines/dcd-to-mp4.js', () => ({
  renderMovieJob: vi.fn()
}))

import { bilboMdHandler } from '../bilboMdHandler.js'
import { multiMdHandler } from '../multiMdHandler.js'
import { movieHandler } from '../movieHandler.js'
import { processBilboMDPDBJob } from '../../services/pipelines/bilbomd-pdb.js'
import { processMultiMDJob } from '../../services/pipelines/bilbomd-multi.js'
import { renderMovieJob } from '../../services/pipelines/dcd-to-mp4.js'

// A pipeline that runs until its job's abort signal fires, like a real one
// blocked on a long external process
const untilAborted = async () => {
  const signal = currentAbortSignal()
  if (!signal) throw new Error('pipeline ran outside a cancellable context')
  await new Promise((resolve) =>
    signal.addEventListener('abort', resolve, { once: true })
  )
  throw new Error('Process was cancelled')
}

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('handlers run pipelines in a cancellable context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bilboMdHandler: cancelling by Mongo jobid stops the job without retry', async () => {
    vi.mocked(processBilboMDPDBJob).mockImplementation(untilAborted)
    const job = {
      id: '1',
      name: 'pdb job',
      data: { type: 'pdb', jobid: 'mongo-pdb' }
    } as unknown as Job

    const p = bilboMdHandler(job)
    await tick()
    expect(cancelRunningJob('mongo-pdb', 'job deleted by user')).toBe(1)

    const err = await p.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UnrecoverableError)
    expect((err as Error).message).toBe('Job cancelled: job deleted by user')
  })

  it('bilboMdHandler: follows the BullMQ processor signal', async () => {
    vi.mocked(processBilboMDPDBJob).mockImplementation(untilAborted)
    const job = {
      id: '2',
      name: 'pdb job',
      data: { type: 'pdb', jobid: 'mongo-pdb-2' }
    } as unknown as Job
    const bullmq = new AbortController()

    const p = bilboMdHandler(job, 'token', bullmq.signal)
    await tick()
    bullmq.abort('cancelled from BullMQ')

    await expect(p).rejects.toThrow('Job cancelled: cancelled from BullMQ')
  })

  it('multiMdHandler: cancelling by Mongo jobid stops the job', async () => {
    vi.mocked(processMultiMDJob).mockImplementation(untilAborted)
    const job = {
      id: '3',
      name: 'multi',
      data: { type: 'BilboMDMultiJob', jobid: 'mongo-multi' }
    } as unknown as Job

    const p = multiMdHandler(job)
    await tick()
    expect(cancelRunningJob('mongo-multi', 'deleted')).toBe(1)

    await expect(p).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it("movieHandler: cancelling the parent job's id stops its renders", async () => {
    vi.mocked(renderMovieJob).mockImplementation(untilAborted)
    const job = {
      id: '4',
      name: 'render-movie',
      data: { jobId: 'mongo-parent', label: 'rg_25' }
    } as unknown as Job

    const p = movieHandler(job)
    await tick()
    expect(cancelRunningJob('mongo-parent', 'deleted')).toBe(1)

    await expect(p).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
