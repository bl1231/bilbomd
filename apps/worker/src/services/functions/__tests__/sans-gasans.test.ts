import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { Job as BullMQJob } from 'bullmq'
import type { IBilboMDSANSJob } from '@bilbomd/mongodb-schema'

const { runProcessMock, updateStepStatusMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  updateStepStatusMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { runGASANS } from '../sans-gasans.js'
import { config } from '../../../config/config.js'

const makeMQJob = () =>
  ({ updateProgress: vi.fn(), log: vi.fn() }) as unknown as BullMQJob

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gasans-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})
describe('runGASANS', () => {
  const job = { uuid: 'sans-job', title: 'sans' } as unknown as IBilboMDSANSJob

  it('runs GA-SANS appending to its logs, with a heartbeat', async () => {
    const MQjob = makeMQJob()

    await runGASANS(MQjob, job)

    const workingDir = path.join(config.uploadDir, 'sans-job')
    const opts = runProcessMock.mock.calls[0][0]
    expect(opts).toMatchObject({
      label: 'GA-SANS',
      args: ['/app/scripts/sans/GASANS-dask.py'],
      cwd: workingDir,
      stdoutFile: path.join(workingDir, 'gasans.log'),
      stderrFile: path.join(workingDir, 'gasans-error.log'),
      appendLogs: true,
      timeoutMs: config.processTimeouts.gasansMs
    })
    opts.heartbeat.onBeat(10_000)
    expect(MQjob.log).toHaveBeenCalledWith('Heartbeat: still running GA-SANS')
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'gasans', {
      status: 'Success',
      message: 'GA-SANS analysis has completed successfully.'
    })
  })

  it('marks the step as failed and rethrows', async () => {
    runProcessMock.mockRejectedValue(
      new Error('GA-SANS failed to start: ENOENT')
    )

    await expect(runGASANS(makeMQJob(), job)).rejects.toThrow(
      'GA-SANS failed to start: ENOENT'
    )
    expect(updateStepStatusMock).toHaveBeenLastCalledWith(job, 'gasans', {
      status: 'Error',
      message: 'GA-SANS analysis failed: GA-SANS failed to start: ENOENT'
    })
  })
})
