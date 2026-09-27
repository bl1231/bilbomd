import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { ipKeyGenerator } from 'express-rate-limit'
import { Job } from '@bilbomd/mongodb-schema'
import { clientIp } from '../../middleware/clientIp.js'
import { openJobEventStream } from '../jobs/streamJobEvents.js'
import {
  createConnectionLimiter,
  type ConnectionLimiter
} from '../../services/connectionLimiter.js'
import { publicJobQuery } from './utils/publicJobQuery.js'

// Plenty for one person with a few tabs open, or a small lab behind one
// address; stops a single client from holding many streams open
export const MAX_PUBLIC_STREAMS_PER_CLIENT = 10

// GET /public/jobs/:publicId/events: a Server-Sent Events stream of changes to
// one public job, for its unauthenticated status page. The token in the URL
// grants access exactly as it does for GET /public/jobs/:publicId, and the
// stream carries only that job's events.
export const createPublicJobEventsHandler =
  (limiter: ConnectionLimiter) => async (req: Request, res: Response) => {
    const publicId = String(req.params.publicId)
    const job = await Job.findOne(publicJobQuery(publicId))
      .select('_id')
      .lean<{ _id: Types.ObjectId }>()
    if (!job) {
      res.status(404).json({ message: 'Job not found' })
      return
    }

    // ipKeyGenerator groups IPv6 addresses by subnet, as the rate limiters do
    const key = ipKeyGenerator(clientIp(req))
    if (!limiter.tryAcquire(key)) {
      res.status(429).json({
        message:
          'Too many open job status connections from this address. Close some job pages and try again.'
      })
      return
    }

    openJobEventStream(
      req,
      res,
      { privileged: false, jobId: job._id.toString() },
      () => limiter.release(key)
    )
  }

export const streamPublicJobEvents = createPublicJobEventsHandler(
  createConnectionLimiter(MAX_PUBLIC_STREAMS_PER_CLIENT)
)
