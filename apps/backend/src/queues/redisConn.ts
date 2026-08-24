import { Redis, RedisOptions } from 'ioredis'
import { logger } from '../middleware/loggers.js'

// Retry indefinitely with capped backoff so a redis outage during a rolling
// deploy doesn't crash the backend (see sessionRedisConn.ts).
const redisRetryStrategy = (times: number): number => Math.min(times * 500, 5000)

const redisOptions: RedisOptions = {
  port:
    process.env.REDIS_PORT && !isNaN(parseInt(process.env.REDIS_PORT, 10))
      ? parseInt(process.env.REDIS_PORT, 10)
      : 6379,
  host: process.env.REDIS_HOST || 'localhost',
  maxRetriesPerRequest: null,
  retryStrategy: redisRetryStrategy,
  tls: process.env.REDIS_TLS ? JSON.parse(process.env.REDIS_TLS) : false
}

const redis = new Redis(redisOptions)

// Without an 'error' listener ioredis connection errors are raised as
// uncaught exceptions and kill the process.
redis.on('error', (err: Error) => {
  logger.error(`Redis client error: ${err.message}`)
})

export { redis, redisRetryStrategy }
