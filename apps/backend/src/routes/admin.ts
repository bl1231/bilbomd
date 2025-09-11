import express from 'express'
import { Redis, RedisOptions } from 'ioredis'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Queue as QueueMQ } from 'bullmq'
// import { verifyJWT } from '../middleware/verifyJWT.js'

const basePath = '/admin/bullmq'

const router = express.Router()

const redisOptions: RedisOptions = {
  port:
    process.env.REDIS_PORT && !isNaN(parseInt(process.env.REDIS_PORT, 10))
      ? parseInt(process.env.REDIS_PORT, 10)
      : 6379,
  host: process.env.REDIS_HOST || 'localhost',
  tls: process.env.REDIS_TLS ? JSON.parse(process.env.REDIS_TLS) : false
}

const redis = new Redis(redisOptions)

// Create instances for both queues
const bilbomdQueue = new QueueMQ('bilbomd', { connection: redis })
const bilbomdScoperQueue = new QueueMQ('bilbomd-scoper', { connection: redis })
const pdb2crdQueue = new QueueMQ('pdb2crd', { connection: redis })
const multimdQueue = new QueueMQ('multimd', { connection: redis })

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath(basePath)

createBullBoard({
  queues: [
    new BullMQAdapter(bilbomdQueue),
    new BullMQAdapter(bilbomdScoperQueue),
    new BullMQAdapter(pdb2crdQueue),
    new BullMQAdapter(multimdQueue)
  ],
  serverAdapter: serverAdapter
})

// router.use(verifyJWT)

router.use('/', serverAdapter.getRouter())

export { router, bilbomdQueue, bilbomdScoperQueue }
