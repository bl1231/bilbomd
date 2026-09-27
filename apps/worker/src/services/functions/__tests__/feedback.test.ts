import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IJob } from '@bilbomd/mongodb-schema'

const { runProcessMock, readFileMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  readFileMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('fs-extra', () => ({
  default: { promises: { readFile: readFileMock } }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnFeedbackScript } from '../feedback.js'
import { config } from '../../../config/config.js'

const makeJob = () =>
  ({
    uuid: 'job-uuid',
    feedback: undefined,
    save: vi.fn().mockResolvedValue(undefined)
  }) as unknown as IJob & { save: ReturnType<typeof vi.fn> }

describe('feedback - spawnFeedbackScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue({ code: 0 })
  })

  it('runs the feedback script in the results dir with its log files', async () => {
    readFileMock.mockResolvedValue('{}')

    await spawnFeedbackScript(makeJob())

    const opts = runProcessMock.mock.calls[0][0]
    expect(opts).toMatchObject({
      label: 'Feedback script',
      cmd: '/opt/envs/base/bin/python',
      cwd: expect.stringMatching(/job-uuid\/results$/),
      stdoutFile: expect.stringMatching(/results\/feedback\.log$/),
      stderrFile: expect.stringMatching(/results\/feedback_error\.log$/),
      timeoutMs: config.processTimeouts.helperScriptMs
    })
    expect(opts.args[0]).toBe('/app/scripts/pipeline_decision_tree.py')
  })

  it('reads feedback.json, stores it on the job, and saves', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ score: 42, ok: true }))
    const job = makeJob()

    await expect(spawnFeedbackScript(job)).resolves.toBeUndefined()
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('feedback.json'),
      'utf-8'
    )
    expect(job.feedback).toEqual({ score: 42, ok: true })
    expect(job.save).toHaveBeenCalledTimes(1)
  })

  it('rejects when feedback.json cannot be read or parsed', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT feedback.json'))

    await expect(spawnFeedbackScript(makeJob())).rejects.toThrow(
      'ENOENT feedback.json'
    )
  })

  it('does not read feedback.json when the script fails', async () => {
    runProcessMock.mockRejectedValue(
      new Error('Feedback script exited with code 2')
    )

    await expect(spawnFeedbackScript(makeJob())).rejects.toThrow(
      'Feedback script exited with code 2'
    )
    expect(readFileMock).not.toHaveBeenCalled()
  })
})
