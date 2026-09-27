import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'

const { findOneMock } = vi.hoisted(() => ({ findOneMock: vi.fn() }))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: findOneMock }
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { streamJobEvents, HEARTBEAT_MS } from '../streamJobEvents.js'
import {
  closeAllJobEventClients,
  dispatchJobEvent,
  jobEventClientCount
} from '../../../services/jobEvents.js'

const userLookup = (user: { _id: { toString: () => string } } | null) =>
  findOneMock.mockReturnValue({
    select: () => ({ lean: async () => user })
  })

const makeReq = (user: string, roles: string[]) =>
  Object.assign(new EventEmitter(), { user, roles }) as unknown as Request &
    EventEmitter

const makeRes = () => {
  const res = {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  }
  return res
}

const written = (res: ReturnType<typeof makeRes>) =>
  res.write.mock.calls.map(([chunk]) => chunk).join('')

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  closeAllJobEventClients()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('streamJobEvents', () => {
  it('opens an unbuffered event stream', async () => {
    userLookup({ _id: { toString: () => 'user-1' } })
    const res = makeRes()

    await streamJobEvents(
      makeReq('alice', ['User']),
      res as unknown as Response
    )

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'X-Accel-Buffering': 'no'
      })
    )
    expect(written(res)).toBe(': connected\n\n')
    expect(jobEventClientCount()).toBe(1)
  })

  it("streams the user's own job events and not others'", async () => {
    userLookup({ _id: { toString: () => 'user-1' } })
    const res = makeRes()
    await streamJobEvents(
      makeReq('alice', ['User']),
      res as unknown as Response
    )

    dispatchJobEvent(
      JSON.stringify({ jobId: 'mine', ownerId: 'user-1', kind: 'updated' })
    )
    dispatchJobEvent(
      JSON.stringify({ jobId: 'theirs', ownerId: 'user-2', kind: 'updated' })
    )

    expect(written(res)).toBe(
      ': connected\n\n' +
        'event: job\ndata: {"jobId":"mine","ownerId":"user-1","kind":"updated"}\n\n'
    )
  })

  it('streams every job to Admins without looking up the user', async () => {
    const res = makeRes()
    await streamJobEvents(
      makeReq('root', ['Admin']),
      res as unknown as Response
    )

    dispatchJobEvent(
      JSON.stringify({ jobId: 'theirs', ownerId: 'user-2', kind: 'deleted' })
    )

    expect(findOneMock).not.toHaveBeenCalled()
    expect(written(res)).toContain('"jobId":"theirs"')
  })

  it('rejects users with no user record', async () => {
    userLookup(null)
    const res = makeRes()

    await streamJobEvents(
      makeReq('ghost', ['User']),
      res as unknown as Response
    )

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.writeHead).not.toHaveBeenCalled()
    expect(jobEventClientCount()).toBe(0)
  })

  it('sends a heartbeat comment', async () => {
    const res = makeRes()
    await streamJobEvents(
      makeReq('root', ['Admin']),
      res as unknown as Response
    )

    vi.advanceTimersByTime(HEARTBEAT_MS)

    expect(written(res)).toBe(': connected\n\n: ping\n\n')
  })

  it('cleans up when the browser disconnects', async () => {
    const res = makeRes()
    const req = makeReq('root', ['Admin'])
    await streamJobEvents(req, res as unknown as Response)

    req.emit('close')
    vi.advanceTimersByTime(HEARTBEAT_MS * 2)
    dispatchJobEvent(JSON.stringify({ jobId: 'j', kind: 'updated' }))

    expect(jobEventClientCount()).toBe(0)
    expect(written(res)).toBe(': connected\n\n')
  })
})
