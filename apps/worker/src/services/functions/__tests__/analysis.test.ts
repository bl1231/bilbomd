import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IJob } from '@bilbomd/mongodb-schema'

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnRgyrDmaxScript } from '../analysis.js'
import { config } from '../../../config/config.js'

const job = { uuid: 'job-uuid' } as IJob

describe('analysis - spawnRgyrDmaxScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue({ code: 0 })
  })

  it('runs the rgyr/dmax script in the job dir with its log files', async () => {
    await spawnRgyrDmaxScript(job)

    expect(runProcessMock).toHaveBeenCalledTimes(1)
    const opts = runProcessMock.mock.calls[0][0]
    expect(opts).toMatchObject({
      label: 'Rgyr Dmax script',
      cmd: '/opt/envs/base/bin/python',
      cwd: expect.stringContaining('job-uuid'),
      stdoutFile: expect.stringMatching(/job-uuid\/rgyr_v_dmax\.log$/),
      stderrFile: expect.stringMatching(/job-uuid\/rgyr_v_dmax_error\.log$/),
      timeoutMs: config.processTimeouts.helperScriptMs
    })
    expect(opts.args[0]).toBe('/app/scripts/rgyr_v_dmax_analysis.py')
  })

  it('propagates failures from the script', async () => {
    runProcessMock.mockRejectedValue(
      new Error('Rgyr Dmax script exited with code 1')
    )

    await expect(spawnRgyrDmaxScript(job)).rejects.toThrow(
      'Rgyr Dmax script exited with code 1'
    )
  })
})
