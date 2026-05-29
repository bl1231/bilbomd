import { createClient } from 'redis'

const port =
  process.env.REDIS_PORT && !isNaN(parseInt(process.env.REDIS_PORT, 10))
    ? parseInt(process.env.REDIS_PORT, 10)
    : 6379

const host = process.env.REDIS_HOST || 'localhost'
const useTls = process.env.REDIS_TLS === 'true'

const sessionRedis = createClient({
  socket: useTls
    ? { port, host, tls: true as const }
    : { port, host }
})

export { sessionRedis }
