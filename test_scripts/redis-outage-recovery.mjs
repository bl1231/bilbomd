// Checks that idle BullMQ workers pick up jobs again after a Redis outage.
//
// bullmq < 6.3.3 left idle workers parked forever once Redis came back
// (taskforcesh/bullmq#4586): no errors, no bzpopmin, new jobs sat in `wait`
// until the container was restarted. Re-run this after bumping bullmq.
//
// Needs docker. Uses apps/worker's bullmq/ioredis and a throwaway redis
// container, set up like apps/worker: several workers sharing one ioredis
// connection.
//
//   node test_scripts/redis-outage-recovery.mjs            # 10s outage
//   OUTAGE_MS=130000 node test_scripts/redis-outage-recovery.mjs
//
// Exits 0 when every idle worker recovered, 1 otherwise.

import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(
  fileURLToPath(new URL('../apps/worker/package.json', import.meta.url))
)
const { Redis } = require('ioredis')
const { Worker, Queue } = require('bullmq')

const PORT = Number(process.env.PORT || 26399)
const OUTAGE_MS = Number(process.env.OUTAGE_MS || 10_000)
const CONTAINER = `bilbomd-redis-outage-test-${PORT}`
const REDIS_IMAGE = process.env.REDIS_IMAGE || 'redis:8.10.2'
const IDLE = ['idle-a', 'idle-b']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (msg) =>
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`)
const docker = (args) => execSync(`docker ${args}`, { stdio: 'ignore' })

const connect = () => {
  const conn = new Redis({
    host: '127.0.0.1',
    port: PORT,
    maxRetriesPerRequest: null
  })
  conn.on('error', () => {})
  return conn
}

const waitFor = async (check, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await sleep(500)
  }
  return false
}

const main = async () => {
  log(
    `bullmq ${require('bullmq/package.json').version}, outage ${OUTAGE_MS / 1000}s`
  )
  try {
    docker(`rm -f ${CONTAINER}`)
  } catch {}
  docker(`run -d --name ${CONTAINER} -p 127.0.0.1:${PORT}:6379 ${REDIS_IMAGE}`)
  await sleep(1000)

  const shared = connect()
  const processed = new Map(IDLE.map((name) => [name, 0]))
  const workers = [
    // One worker stays busy through the outage, like a long MD job.
    new Worker('busy', () => sleep(OUTAGE_MS + 60_000), { connection: shared }),
    ...IDLE.map(
      (name) =>
        new Worker(
          name,
          async () => {
            processed.set(name, processed.get(name) + 1)
          },
          { connection: shared }
        )
    )
  ]
  workers.forEach((worker) => worker.on('error', () => {}))

  const queueConn = connect()
  const queues = Object.fromEntries(
    ['busy', ...IDLE].map((name) => [
      name,
      new Queue(name, { connection: queueConn })
    ])
  )
  Object.values(queues).forEach((queue) => queue.on('error', () => {}))

  const probe = async (expected) => {
    for (const name of IDLE) await queues[name].add('probe', {})
    return waitFor(
      () => IDLE.every((name) => processed.get(name) >= expected),
      20_000
    )
  }

  await queues.busy.add('long', {})
  if (!(await probe(1)))
    throw new Error('workers did not process jobs before the outage')
  log('workers processing jobs; stopping redis')

  docker(`stop ${CONTAINER}`)
  await sleep(OUTAGE_MS)
  docker(`start ${CONTAINER}`)
  log('redis back; probing idle workers')

  const recovered = await probe(2)
  for (const name of IDLE)
    log(`${name}: processed ${processed.get(name)} job(s)`)

  await Promise.allSettled(workers.map((worker) => worker.close(true)))
  await Promise.allSettled(Object.values(queues).map((queue) => queue.close()))
  shared.disconnect()
  queueConn.disconnect()
  docker(`rm -f ${CONTAINER}`)

  log(
    recovered
      ? 'PASS: idle workers recovered'
      : 'FAIL: idle workers did not recover'
  )
  process.exit(recovered ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  try {
    docker(`rm -f ${CONTAINER}`)
  } catch {}
  process.exit(1)
})
