import { createClient } from 'redis'
import { logger } from '../middleware/loggers.js'

const port =
  process.env.REDIS_PORT && !isNaN(parseInt(process.env.REDIS_PORT, 10))
    ? parseInt(process.env.REDIS_PORT, 10)
    : 6379

const host = process.env.REDIS_HOST || 'localhost'
const useTls = process.env.REDIS_TLS === 'true'

// Retry indefinitely with capped backoff — during a rolling deploy the redis
// Deployment (Recreate strategy) is down while its image pulls, and a startup
// crash here stalls the whole Helm upgrade.
const sessionRedisReconnectStrategy = (retries: number): number =>
  Math.min(retries * 500, 5000)

const sessionRedis = createClient({
  socket: useTls
    ? { port, host, tls: true as const, reconnectStrategy: sessionRedisReconnectStrategy }
    : { port, host, reconnectStrategy: sessionRedisReconnectStrategy }
})

// Without an 'error' listener a failed connection attempt is raised as an
// uncaught exception and kills the process.
sessionRedis.on('error', (err: Error) => {
  logger.error(`Session Redis client error: ${err.message}`)
})

sessionRedis.on('reconnecting', () => {
  logger.warn(`Session Redis reconnecting to ${host}:${port}`)
})

sessionRedis.on('ready', () => {
  logger.info(`Session Redis connected to ${host}:${port}`)
})

export { sessionRedis, sessionRedisReconnectStrategy }
