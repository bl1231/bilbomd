import { Redis, RedisOptions } from 'ioredis'

const redisOptions: RedisOptions = {
  port:
    process.env.REDIS_PORT && !isNaN(parseInt(process.env.REDIS_PORT, 10))
      ? parseInt(process.env.REDIS_PORT, 10)
      : 6379,
  host: process.env.REDIS_HOST || 'localhost',
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_TLS ? JSON.parse(process.env.REDIS_TLS) : false
}

const redis = new Redis(redisOptions)

export { redis }
