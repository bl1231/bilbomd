import { describe, it, expect, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  queueNames: [] as string[],
  boardQueues: [] as unknown[]
}))

vi.mock('ioredis', () => ({
  Redis: vi.fn(function MockRedis() {})
}))

vi.mock('bullmq', () => ({
  Queue: vi.fn(function MockQueue(this: { name: string }, name: string) {
    this.name = name
    hoisted.queueNames.push(name)
  })
}))

vi.mock('@bull-board/api', () => ({
  createBullBoard: ({ queues }: { queues: unknown[] }) => {
    hoisted.boardQueues.push(...queues)
  }
}))

vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn(function MockAdapter(
    this: { queue: unknown },
    queue: unknown
  ) {
    this.queue = queue
  })
}))

vi.mock('@bull-board/express', () => ({
  ExpressAdapter: vi.fn(function MockExpressAdapter(
    this: Record<string, unknown>
  ) {
    this.setBasePath = vi.fn()
    this.getRouter = vi.fn(
      () => (_req: unknown, _res: unknown, next: () => void) => next()
    )
  })
}))

import { bilbomdScoperQueue } from '../admin.js'

describe('Bull Board admin route', () => {
  // Must match the queue names the backend enqueues to and the workers consume.
  it('shows the queues the backend and workers actually use', () => {
    expect(hoisted.queueNames).toEqual([
      'bilbomd',
      'scoper',
      'multimd',
      'delete-bilbomd'
    ])
    expect(hoisted.boardQueues).toHaveLength(4)
  })

  it('points the SCOPER entry at the scoper queue', () => {
    expect((bilbomdScoperQueue as unknown as { name: string }).name).toBe(
      'scoper'
    )
  })
})
