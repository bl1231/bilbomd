import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'

// Capture instances created via `new UsageEvent(doc)` so we can assert on the
// document shape and the save() call. Hoisted so the vi.mock factory (which is
// itself hoisted above imports) can safely reference them.
const { saveMock, usageEventMock, usageEventInstances } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  usageEventMock: vi.fn(),
  usageEventInstances: [] as Array<Record<string, unknown>>
}))

vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual =
    await vi.importActual<typeof import('@bilbomd/mongodb-schema')>(
      '@bilbomd/mongodb-schema'
    )
  return { ...actual, UsageEvent: usageEventMock }
})

import { buildContext, recordWorkerUsageEvent } from '../usage-events.js'

describe('usage-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usageEventInstances.length = 0
    // Re-apply implementations after clearAllMocks wipes call history.
    saveMock.mockResolvedValue(undefined)
    usageEventMock.mockImplementation(function (doc: Record<string, unknown>) {
      usageEventInstances.push(doc)
      return { ...doc, save: saveMock }
    })
  })

  describe('buildContext', () => {
    it('builds an anonymous context with public_id and ip hash', () => {
      const ctx = buildContext({
        access_mode: 'anonymous',
        public_id: 'pub-123',
        client_ip_hash: 'hash-abc'
      })

      expect(ctx.access_mode).toBe('anonymous')
      expect(ctx.user).toBeUndefined()
      expect(ctx.public_id).toBe('pub-123')
      expect(ctx.client_ip_hash).toBe('hash-abc')
    })

    it('does not attach a user when access_mode is anonymous even if user given', () => {
      const ctx = buildContext({
        access_mode: 'anonymous',
        user: {
          _id: new Types.ObjectId(),
          username: 'alice',
          email: 'alice@example.com'
        }
      })

      expect(ctx.user).toBeUndefined()
    })

    it('normalizes a populated user with an ObjectId _id', () => {
      const id = new Types.ObjectId()
      const ctx = buildContext({
        access_mode: 'user',
        user: { _id: id, username: 'bob', email: 'bob@example.com' }
      })

      expect(ctx.user).toBeDefined()
      expect(ctx.user?._id).toBeInstanceOf(Types.ObjectId)
      expect(ctx.user?._id.toString()).toBe(id.toString())
      expect(ctx.user?.username).toBe('bob')
      expect(ctx.user?.email).toBe('bob@example.com')
    })

    it('normalizes a populated user with a string _id into an ObjectId', () => {
      const id = new Types.ObjectId().toString()
      const ctx = buildContext({
        access_mode: 'user',
        user: { _id: id, username: 'carol', email: 'carol@example.com' }
      })

      expect(ctx.user?._id).toBeInstanceOf(Types.ObjectId)
      expect(ctx.user?._id.toString()).toBe(id)
    })

    it('normalizes a summary user (id field) into an ObjectId _id', () => {
      const id = new Types.ObjectId().toString()
      const ctx = buildContext({
        access_mode: 'user',
        user: { id, username: 'dave', email: 'dave@example.com' }
      })

      expect(ctx.user?._id).toBeInstanceOf(Types.ObjectId)
      expect(ctx.user?._id.toString()).toBe(id)
      expect(ctx.user?.username).toBe('dave')
    })

    it('leaves user undefined when shape is unrecognized', () => {
      const ctx = buildContext({
        access_mode: 'user',
        user: { foo: 'bar' } as unknown as Record<string, unknown>
      })

      expect(ctx.user).toBeUndefined()
    })

    it('leaves user undefined for null user', () => {
      const ctx = buildContext({ access_mode: 'user', user: null })
      expect(ctx.user).toBeUndefined()
    })

    it('does not treat a user with non-string fields as a valid shape', () => {
      const ctx = buildContext({
        access_mode: 'user',
        user: {
          _id: new Types.ObjectId(),
          username: 123,
          email: 'x@example.com'
        } as unknown as Record<string, unknown>
      })

      expect(ctx.user).toBeUndefined()
    })
  })

  describe('recordWorkerUsageEvent', () => {
    const baseContext = buildContext({ access_mode: 'anonymous' })

    it('persists a usage event with normalized fields', async () => {
      const jobId = new Types.ObjectId()

      await recordWorkerUsageEvent({
        uuid: 'uuid-1',
        jobId,
        pipeline: 'pdb',
        eventType: 'job_completed',
        status: 'Completed',
        durationMs: 1234,
        context: baseContext
      })

      expect(saveMock).toHaveBeenCalledTimes(1)
      expect(usageEventInstances).toHaveLength(1)
      const doc = usageEventInstances[0]
      expect(doc.uuid).toBe('uuid-1')
      expect(doc.pipeline).toBe('pdb')
      expect(doc.event_type).toBe('job_completed')
      expect(doc.status).toBe('Completed')
      expect(doc.duration_ms).toBe(1234)
      expect((doc.job_id as Types.ObjectId).toString()).toBe(jobId.toString())
      expect(doc.timestamp).toBeInstanceOf(Date)
    })

    it('accepts a string jobId', async () => {
      const jobId = new Types.ObjectId().toString()

      await recordWorkerUsageEvent({
        uuid: 'uuid-2',
        jobId,
        pipeline: 'auto',
        eventType: 'job_started',
        context: baseContext
      })

      const doc = usageEventInstances[0]
      expect((doc.job_id as Types.ObjectId).toString()).toBe(jobId)
    })

    it('swallows persistence errors without throwing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      saveMock.mockRejectedValueOnce(new Error('db down'))

      await expect(
        recordWorkerUsageEvent({
          uuid: 'uuid-3',
          jobId: new Types.ObjectId(),
          pipeline: 'multi',
          eventType: 'job_failed',
          context: baseContext
        })
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })
})
