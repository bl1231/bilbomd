import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { IJob } from '@bilbomd/mongodb-schema'

const { spawnMock, createWriteStreamMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  createWriteStreamMock: vi.fn()
}))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

vi.mock('fs-extra', () => ({
  default: { createWriteStream: createWriteStreamMock }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnRgyrDmaxScript } from '../analysis.js'

// Minimal fake ChildProcess: an EventEmitter with stdout/stderr emitters.
const makeChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

const job = { uuid: 'job-uuid' } as IJob

describe('analysis - spawnRgyrDmaxScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createWriteStreamMock.mockImplementation(() => ({
      write: vi.fn(),
      end: (cb?: () => void) => cb && cb()
    }))
  })

  it('spawns the python rgyr/dmax script with the expected args', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)

    const p = spawnRgyrDmaxScript(job)
    child.emit('exit', 0)
    await p

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = spawnMock.mock.calls[0]
    expect(bin).toBe('/opt/envs/base/bin/python')
    expect(args).toContain('/app/scripts/rgyr_v_dmax_analysis.py')
    expect(opts).toMatchObject({ cwd: expect.stringContaining('job-uuid') })
  })

  it('resolves and pipes stdout/stderr when the script exits 0', async () => {
    const child = makeChild()
    const logStream = { write: vi.fn(), end: (cb?: () => void) => cb && cb() }
    const errStream = { write: vi.fn(), end: (cb?: () => void) => cb && cb() }
    createWriteStreamMock
      .mockReturnValueOnce(logStream)
      .mockReturnValueOnce(errStream)
    spawnMock.mockReturnValue(child)

    const p = spawnRgyrDmaxScript(job)
    child.stdout.emit('data', Buffer.from('hello stdout'))
    child.stderr.emit('data', Buffer.from('a warning'))
    child.emit('exit', 0)

    await expect(p).resolves.toBeUndefined()
    expect(logStream.write).toHaveBeenCalledWith('hello stdout')
    expect(errStream.write).toHaveBeenCalledWith('a warning')
  })

  it('rejects when the script exits with a non-zero code', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)

    const p = spawnRgyrDmaxScript(job)
    child.emit('exit', 1)

    await expect(p).rejects.toThrow(/Rgyr Dmax script failed/)
  })

  it('rejects when the child process emits an error', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)

    const p = spawnRgyrDmaxScript(job)
    child.emit('error', new Error('spawn ENOENT'))

    await expect(p).rejects.toThrow('spawn ENOENT')
  })
})
