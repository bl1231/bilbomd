import { describe, it, expect, vi, afterAll } from 'vitest'
import express, { type RequestHandler } from 'express'
import request from 'supertest'

vi.mock('../loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

import { loginLimiter } from '../loginLimiter.js'
import { externalApiLimiter } from '../externalApiLimiter.js'
import { publicJobLimiter } from '../publicJobLimiter.js'

// Each limiter is a module-level instance with its own in-memory store, so
// every test uses addresses no other test uses.

const buildApp = (limiter: RequestHandler) =>
  express().post('/', limiter, (_req, res) => {
    res.sendStatus(200)
  })

describe.each([
  ['loginLimiter', loginLimiter, 3, '203.0.113'],
  ['externalApiLimiter', externalApiLimiter, 10, '198.51.100'],
  ['publicJobLimiter', publicJobLimiter, 5, '192.0.2']
])('%s', (_, limiter, max, net) => {
  // One listening server per limiter. Passing the bare app would make
  // supertest start and stop a server for every request, which intermittently
  // hangs or resets under Node's keep-alive agent.
  const server = buildApp(limiter as RequestHandler).listen(0)
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const from = (ip: string) =>
    request(server).post('/').set('CF-Connecting-IP', ip)

  it('limits a client by its CF-Connecting-IP', async () => {
    for (let i = 0; i < max; i++) {
      expect((await from(`${net}.10`)).status).toBe(200)
    }
    expect((await from(`${net}.10`)).status).toBe(429)
  })

  it('does not count other clients against it', async () => {
    for (let i = 0; i < max; i++) await from(`${net}.20`)

    expect((await from(`${net}.21`)).status).toBe(200)
  })
})
