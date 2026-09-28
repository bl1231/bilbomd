import { logger } from './loggers.js'

// Exits the process when the BullMQ worker keeps reporting Redis errors, so
// Docker's `restart: always` brings up a fresh worker. A backstop: the scoper
// on hyperion reaches epyc's Redis over the LAN, and a worker stuck in a bad
// connection state looks to the UI like no SCOPER worker at all. (bullmq
// < 6.3.3 also left idle workers parked after any Redis restart; see
// test_scripts/redis-outage-recovery.mjs.) A stalled job is retried by BullMQ
// after the restart.

interface ErrorSource {
  on: (event: 'error', listener: (error: Error) => void) => unknown
}

interface RedisWatchdogOptions {
  // How long errors must keep coming before we give up.
  timeoutMs?: number
  // A gap this long without errors ends the streak (Redis recovered).
  quietMs?: number
  onGiveUp?: (reason: string) => void
  now?: () => number
}

const exitProcess = (reason: string) => {
  logger.error(`${reason}. Exiting so the container restarts.`)
  process.exit(1)
}

export const createRedisWatchdog = ({
  timeoutMs = 120_000,
  quietMs = 60_000,
  onGiveUp = exitProcess,
  now = Date.now
}: RedisWatchdogOptions = {}) => {
  let streakStart: number | null = null
  let lastError = 0
  let gaveUp = false

  const recordError = (error: Error) => {
    if (gaveUp) return
    const t = now()
    if (streakStart === null || t - lastError > quietMs) streakStart = t
    lastError = t
    const elapsed = t - streakStart
    if (elapsed >= timeoutMs) {
      gaveUp = true
      onGiveUp(
        `Redis errors for ${Math.round(elapsed / 1000)}s (last: ${error.message})`
      )
    }
  }

  return { recordError }
}

export const watchRedisErrors = (
  source: ErrorSource,
  options: RedisWatchdogOptions = {}
) => {
  const watchdog = createRedisWatchdog(options)
  source.on('error', (error) => {
    logger.warn(`Scoper worker error: ${error.message}`)
    watchdog.recordError(error)
  })
  return watchdog
}
