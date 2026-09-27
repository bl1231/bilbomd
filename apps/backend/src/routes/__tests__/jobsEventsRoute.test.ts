import { describe, it, expect, vi } from 'vitest'
import express, {
  type Request,
  type Response,
  type NextFunction
} from 'express'
import request from 'supertest'

// Pins that GET /jobs/events reaches the stream controller rather than the
// /:id routes, whose ownership check would reject "events" as a job id.

vi.mock('../../middleware/verifyJWT.js', () => ({
  verifyJWT: (_req: Request, _res: Response, next: NextFunction) => next()
}))
vi.mock('../../middleware/videoAuth.js', () => ({
  setVideoSession: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
  verifyVideoSession: (_req: Request, _res: Response, next: NextFunction) =>
    next()
}))
vi.mock('../../middleware/verifyJobOwnership.js', () => ({
  verifyJobOwnership: (_req: Request, res: Response) => {
    res.status(418).json({ reached: 'verifyJobOwnership' })
  }
}))
vi.mock('../../controllers/jobs/streamJobEvents.js', () => ({
  streamJobEvents: (_req: Request, res: Response) => {
    res.status(200).json({ reached: 'streamJobEvents' })
  }
}))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

const { default: jobsRoutes } = await import('../jobs.js')

describe('jobs router', () => {
  it('routes GET /events to the job event stream', async () => {
    const app = express().use('/jobs', jobsRoutes)

    const res = await request(app).get('/jobs/events')

    expect(res.body).toEqual({ reached: 'streamJobEvents' })
  })
})
