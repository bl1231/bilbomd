import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'

const _hoisted = vi.hoisted(() => ({
  mockSave: vi.fn()
})) as unknown as { mockSave: ReturnType<typeof vi.fn> }
const { mockSave } = _hoisted

vi.mock('@bilbomd/mongodb-schema', () => ({
  // Must be a real constructor so `new UsageEvent(doc)` works
  UsageEvent: function UsageEvent(this: Record<string, unknown>) {
    this.save = mockSave
  },
  Types
}))

import { buildContext, recordWorkerUsageEvent } from '../functions/usageEvents.js'

beforeEach(() => vi.clearAllMocks())

const objectId = new Types.ObjectId()

describe('buildContext', () => {
  it('returns anonymous context when access_mode is anonymous', () => {
    const ctx = buildContext({ access_mode: 'anonymous' })
    expect(ctx.access_mode).toBe('anonymous')
    expect(ctx.user).toBeUndefined()
  })

  it('builds user context from a populated IUser shape (_id + username + email)', () => {
    const ctx = buildContext({
      access_mode: 'user',
      user: { _id: objectId, username: 'alice', email: 'alice@example.com' }
    })
    expect(ctx.user).toMatchObject({
      _id: objectId,
      username: 'alice',
      email: 'alice@example.com'
    })
  })

  it('builds user context from summary shape (id string + username + email)', () => {
    const ctx = buildContext({
      access_mode: 'user',
      user: {
        id: objectId.toString(),
        username: 'bob',
        email: 'bob@example.com'
      }
    })
    expect(ctx.user).toMatchObject({
      username: 'bob',
      email: 'bob@example.com'
    })
    expect(ctx.user?._id).toBeInstanceOf(Types.ObjectId)
  })

  it('returns no user when access_mode is user but user object is missing required fields', () => {
    const ctx = buildContext({
      access_mode: 'user',
      user: { _id: objectId }
    })
    expect(ctx.user).toBeUndefined()
  })

  it('includes public_id and client_ip_hash in context', () => {
    const ctx = buildContext({
      access_mode: 'anonymous',
      public_id: 'pub-abc',
      client_ip_hash: 'hash-xyz'
    })
    expect(ctx.public_id).toBe('pub-abc')
    expect(ctx.client_ip_hash).toBe('hash-xyz')
  })
})

describe('recordWorkerUsageEvent', () => {
  const baseParams = {
    uuid: 'test-uuid',
    jobId: objectId,
    pipeline: 'scoper' as const,
    eventType: 'job_started' as const,
    status: 'Running' as const,
    context: { access_mode: 'anonymous' as const }
  }

  it('saves a UsageEvent document', async () => {
    mockSave.mockResolvedValue({})
    await recordWorkerUsageEvent(baseParams)
    expect(mockSave).toHaveBeenCalledOnce()
  })

  it('accepts a string jobId', async () => {
    mockSave.mockResolvedValue({})
    await recordWorkerUsageEvent({ ...baseParams, jobId: objectId.toString() })
    expect(mockSave).toHaveBeenCalledOnce()
  })

  it('does not throw when save fails', async () => {
    mockSave.mockRejectedValue(new Error('mongo down'))
    await expect(
      recordWorkerUsageEvent(baseParams)
    ).resolves.toBeUndefined()
  })

  it('includes optional durationMs and metadata', async () => {
    mockSave.mockResolvedValue({})
    await recordWorkerUsageEvent({
      ...baseParams,
      durationMs: 12345,
      metadata: { foo: 'bar' }
    })
    expect(mockSave).toHaveBeenCalledOnce()
  })
})
