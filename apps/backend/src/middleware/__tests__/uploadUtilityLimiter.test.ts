import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createUploadUtilityLimiter } from '../uploadUtilityLimiter.js'

vi.mock('../loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const buildApp = (limiter: express.RequestHandler) => {
  const app = express()
  app.post('/upload', limiter, (req, res) => {
    res.status(200).json({ ok: true })
  })
  return app
}

describe('createUploadUtilityLimiter', () => {
  it('allows requests up to the limit, then returns 429', async () => {
    const app = buildApp(createUploadUtilityLimiter({ name: 'AutoRg', max: 2 }))

    expect((await request(app).post('/upload')).status).toBe(200)
    expect((await request(app).post('/upload')).status).toBe(200)

    const res = await request(app).post('/upload')
    expect(res.status).toBe(429)
    expect(res.body.message).toBe(
      'Too many AutoRg requests from this IP. Please wait a few minutes and try again.'
    )
  })

  it('sends standard RateLimit headers', async () => {
    const app = buildApp(createUploadUtilityLimiter({ name: 'AutoRg', max: 5 }))
    const res = await request(app).post('/upload')
    expect(res.headers['ratelimit-limit']).toBe('5')
    expect(res.headers['x-ratelimit-limit']).toBeUndefined()
  })

  it('keeps separate counters for separate limiter instances', async () => {
    const first = createUploadUtilityLimiter({ name: 'AutoRg', max: 1 })
    const second = createUploadUtilityLimiter({ name: 'PAE Jiffy', max: 1 })
    const app = express()
    app.post('/a', first, (req, res) => res.sendStatus(200))
    app.post('/b', second, (req, res) => res.sendStatus(200))

    expect((await request(app).post('/a')).status).toBe(200)
    expect((await request(app).post('/a')).status).toBe(429)
    expect((await request(app).post('/b')).status).toBe(200)
  })

  it('counts each client separately, by CF-Connecting-IP', async () => {
    const app = buildApp(createUploadUtilityLimiter({ name: 'AutoRg', max: 1 }))
    const from = (ip: string) =>
      request(app).post('/upload').set('CF-Connecting-IP', ip)

    expect((await from('203.0.113.1')).status).toBe(200)
    expect((await from('203.0.113.2')).status).toBe(200)
    expect((await from('203.0.113.1')).status).toBe(429)
  })
})
