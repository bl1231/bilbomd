import { describe, it, expect, vi, afterAll } from 'vitest'
import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'
import request from 'supertest'

vi.mock('../../middleware/loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}))
// The token check is stubbed: the X-Test-Token header stands in for the
// token hash verifyAPIToken would set
vi.mock('../../middleware/verifyAPIToken.js', () => ({
  verifyAPIToken: (req: Request, _res: Response, next: NextFunction) => {
    req.apiTokenHash = req.header('X-Test-Token')
    next()
  }
}))
vi.mock('../../middleware/logApiRequests.js', () => ({
  logApiRequest: (_req: Request, _res: Response, next: NextFunction) => next()
}))
vi.mock('../../middleware/verifyJobOwnership.js', () => ({
  verifyJobOwnership: (_req: Request, _res: Response, next: NextFunction) =>
    next()
}))
const { ok } = vi.hoisted(() => ({
  ok: (_req: Request, res: Response) => {
    res.sendStatus(200)
  }
}))
vi.mock('../../controllers/external/createApiJob.js', () => ({
  createApiJob: ok
}))
vi.mock('../../controllers/external/jobStatus.js', () => ({
  getApiJobStatus: ok
}))
vi.mock('../../controllers/external/getResults.js', () => ({
  getExternalJobResults: ok
}))

import externalRoutes from '../external.js'
import {
  EXTERNAL_READ_MAX,
  EXTERNAL_SUBMIT_MAX
} from '../../middleware/externalApiLimiter.js'

// The limiters keep module-level counters, so every test uses its own tokens.
// One listening server for the file (see rateLimiterKeys.test.ts).
const server = express().use('/', externalRoutes).listen(0)
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const submit = (token: string) =>
  request(server).post('/').set('X-Test-Token', token)
const status = (token: string) =>
  request(server).get('/job-1/status').set('X-Test-Token', token)
const results = (token: string) =>
  request(server).get('/job-1/results').set('X-Test-Token', token)

describe('external API rate limits', () => {
  it('allows a token a limited number of submissions per window', async () => {
    for (let i = 0; i < EXTERNAL_SUBMIT_MAX; i++) {
      expect((await submit('submit-a')).status).toBe(200)
    }
    const res = await submit('submit-a')
    expect(res.status).toBe(429)
    expect(res.body.message).toMatch(/job submissions for this API token/)
  })

  it('counts each token separately', async () => {
    for (let i = 0; i < EXTERNAL_SUBMIT_MAX; i++) await submit('submit-b')

    expect((await submit('submit-b')).status).toBe(429)
    expect((await submit('submit-c')).status).toBe(200)
  })

  it('keeps reads available after the submission limit is reached', async () => {
    for (let i = 0; i <= EXTERNAL_SUBMIT_MAX; i++) await submit('submit-d')

    expect((await status('submit-d')).status).toBe(200)
    expect((await results('submit-d')).status).toBe(200)
  })

  it('shares one read budget between status checks and result downloads', async () => {
    for (let i = 0; i < EXTERNAL_READ_MAX; i++) {
      const res = i % 2 ? await results('read-a') : await status('read-a')
      expect(res.status).toBe(200)
    }
    const res = await status('read-a')
    expect(res.status).toBe(429)
    expect(res.body.message).toMatch(/Poll job status every 30-60 seconds/)
    expect((await results('read-a')).status).toBe(429)
    expect((await status('read-b')).status).toBe(200)
  })
})
