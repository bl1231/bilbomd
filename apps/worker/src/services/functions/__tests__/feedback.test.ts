import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { IJob } from '@bilbomd/mongodb-schema'

const { spawnMock, createWriteStreamMock, readFileMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  createWriteStreamMock: vi.fn(),
  readFileMock: vi.fn()
}))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

vi.mock('fs-extra', () => ({
  default: {
    createWriteStream: createWriteStreamMock,
    promises: { readFile: readFileMock }
  }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnFeedbackScript } from '../feedback.js'

const makeChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

const makeJob = () =>
  ({
    uuid: 'job-uuid',
    feedback: undefined,
    save: vi.fn().mockResolvedValue(undefined)
  }) as unknown as IJob & { save: ReturnType<typeof vi.fn> }

describe('feedback - spawnFeedbackScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createWriteStreamMock.mockImplementation(() => ({
      write: vi.fn(),
      end: (cb?: () => void) => cb && cb()
    }))
  })

  it('spawns the python feedback script with the expected args', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    readFileMock.mockResolvedValue('{}')
    const job = makeJob()

    const p = spawnFeedbackScript(job)
    child.emit('exit', 0)
    await p

    const [bin, args, opts] = spawnMock.mock.calls[0]
    expect(bin).toBe('/opt/envs/base/bin/python')
    expect(args).toContain('/app/scripts/pipeline_decision_tree.py')
    expect(opts).toMatchObject({ cwd: expect.stringContaining('results') })
  })

  it('reads feedback.json, stores it on the job, and saves on exit 0', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    readFileMock.mockResolvedValue(JSON.stringify({ score: 42, ok: true }))
    const job = makeJob()

    const p = spawnFeedbackScript(job)
    child.emit('exit', 0)

    await expect(p).resolves.toBeUndefined()
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('feedback.json'),
      'utf-8'
    )
    expect(job.feedback).toEqual({ score: 42, ok: true })
    expect((job as unknown as { save: ReturnType<typeof vi.fn> }).save).toHaveBeenCalledTimes(1)
  })

  it('rejects when feedback.json cannot be read or parsed', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    readFileMock.mockRejectedValue(new Error('ENOENT feedback.json'))
    const job = makeJob()

    const p = spawnFeedbackScript(job)
    child.emit('exit', 0)

    await expect(p).rejects.toThrow('ENOENT feedback.json')
  })

  it('rejects when the script exits with a non-zero code', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const job = makeJob()

    const p = spawnFeedbackScript(job)
    child.emit('exit', 2)

    await expect(p).rejects.toThrow(/Feedback script failed/)
  })

  it('rejects when the child process emits an error', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const job = makeJob()

    const p = spawnFeedbackScript(job)
    child.emit('error', new Error('spawn failed'))

    await expect(p).rejects.toThrow('spawn failed')
  })
})
