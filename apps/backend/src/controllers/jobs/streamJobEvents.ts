import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { User } from '@bilbomd/mongodb-schema'
import { JOB_EVENT_SSE_NAME, type JobEvent } from '@bilbomd/bilbomd-types'
import { logger } from '../../middleware/loggers.js'
import {
  addJobEventClient,
  type JobEventClient
} from '../../services/jobEvents.js'

const PRIVILEGED_ROLES = ['Admin', 'Manager']

// Comment lines keep the connection alive through proxies that close idle
// connections (nginx: 60s, Cloudflare: ~100s)
export const HEARTBEAT_MS = 25_000

// Turns the response into a Server-Sent Events stream of the job events the
// filter allows (see canSeeJobEvent), with a heartbeat. onClose runs once the
// browser disconnects.
export const openJobEventStream = (
  req: Request,
  res: Response,
  filter: Pick<JobEventClient, 'userId' | 'privileged' | 'jobId'>,
  onClose?: () => void
): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tell nginx (and the k8s ingress) not to buffer the stream
    'X-Accel-Buffering': 'no'
  })
  res.write(': connected\n\n')

  const removeClient = addJobEventClient({
    ...filter,
    send: (event: JobEvent) => {
      res.write(
        `event: ${JOB_EVENT_SSE_NAME}\ndata: ${JSON.stringify(event)}\n\n`
      )
    },
    close: () => res.end()
  })

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeClient()
    onClose?.()
    logger.debug('Job event stream closed')
  })
}

// GET /jobs/events: a Server-Sent Events stream of "job X changed" events for
// the jobs this user may see. The events carry no job data; the UI refetches
// changed jobs through the normal REST endpoints.
export const streamJobEvents = async (req: Request, res: Response) => {
  const roles = req.roles ?? []
  const privileged = roles.some((role) => PRIVILEGED_ROLES.includes(role))

  let userId: string | undefined
  if (!privileged) {
    const user = await User.findOne({ username: req.user })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>()
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' })
      return
    }
    userId = user._id.toString()
  }

  openJobEventStream(req, res, { userId, privileged })
}
