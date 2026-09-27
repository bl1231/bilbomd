import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'

const { findOneMock } = vi.hoisted(() => ({ findOneMock: vi.fn() }))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findOne: findOneMock },
  User: { findOne: vi.fn() }
}))
vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { createPublicJobEventsHandler } from '../streamPublicJobEvents.js'
import { createConnectionLimiter } from '../../../services/connectionLimiter.js'
import {
  closeAllJobEventClients,
  dispatchJobEvent,
  jobEventClientCount
} from '../../../services/jobEvents.js'
import { publicJobQuery } from '../utils/publicJobQuery.js'

const jobLookup = (id: string | null) =>
  findOneMock.mockReturnValue({
    select: () => ({
      lean: async () => (id ? { _id: { toString: () => id } } : null)
    })
  })

const makeReq = (publicId: string, ip = '203.0.113.5') =>
  Object.assign(new EventEmitter(), {
    params: { publicId },
    headers: { 'cf-connecting-ip': ip },
    ip: '10.0.0.1'
  }) as unknown as Request & EventEmitter

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
type FakeRes = ReturnType<typeof makeRes>

const written = (res: FakeRes) =>
  res.write.mock.calls.map(([chunk]) => chunk).join('')

let handler: ReturnType<typeof createPublicJobEventsHandler>

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  closeAllJobEventClients()
  handler = createPublicJobEventsHandler(createConnectionLimiter(2))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('streamPublicJobEvents', () => {
  it('looks the job up with the same token rules as the public job page', async () => {
    jobLookup('job-1')

    await handler(makeReq('token-abc'), makeRes() as unknown as Response)

    expect(findOneMock).toHaveBeenCalledWith(publicJobQuery('token-abc'))
  })

  it('returns 404 for an unknown token', async () => {
    jobLookup(null)
    const res = makeRes()

    await handler(makeReq('nope'), res as unknown as Response)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.writeHead).not.toHaveBeenCalled()
  })

  it("streams only its own job's events", async () => {
    jobLookup('job-1')
    const res = makeRes()
    await handler(makeReq('token-abc'), res as unknown as Response)

    dispatchJobEvent(
      JSON.stringify({ jobId: 'job-2', ownerId: 'u', kind: 'updated' })
    )
    dispatchJobEvent(JSON.stringify({ jobId: 'job-1', kind: 'movies' }))

    expect(written(res)).toBe(
      ': connected\n\nevent: job\ndata: {"jobId":"job-1","kind":"movies"}\n\n'
    )
  })

  it('caps open streams per client and frees a slot on disconnect', async () => {
    jobLookup('job-1')
    const first = makeReq('token-abc')
    await handler(first, makeRes() as unknown as Response)
    await handler(makeReq('token-abc'), makeRes() as unknown as Response)

    const refused = makeRes()
    await handler(makeReq('token-abc'), refused as unknown as Response)
    expect(refused.status).toHaveBeenCalledWith(429)
    expect(refused.writeHead).not.toHaveBeenCalled()
    expect(jobEventClientCount()).toBe(2)

    first.emit('close')
    const retry = makeRes()
    await handler(makeReq('token-abc'), retry as unknown as Response)
    expect(retry.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
  })

  it('counts each client separately, by CF-Connecting-IP', async () => {
    jobLookup('job-1')
    await handler(makeReq('t', '203.0.113.5'), makeRes() as unknown as Response)
    await handler(makeReq('t', '203.0.113.5'), makeRes() as unknown as Response)

    const other = makeRes()
    await handler(makeReq('t', '198.51.100.7'), other as unknown as Response)

    expect(other.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
  })
})
