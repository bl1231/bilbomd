import { AsyncLocalStorage } from 'node:async_hooks'
import { UnrecoverableError } from 'bullmq'
import { logger } from './loggers.js'

// Each running job gets an AbortSignal that lives in async context, so
// runProcess() can pick it up without threading a signal through every
// pipeline and step function.
const context = new AsyncLocalStorage<AbortSignal>()

// Running jobs by MongoDB id (the `jobid` in BullMQ job data). A job id can
// map to several controllers, e.g. a BilboMD job and its movie renders.
const running = new Map<string, Set<AbortController>>()

export const currentAbortSignal = (): AbortSignal | undefined =>
  context.getStore()

// Runs `fn` in a cancellable context. It is aborted when `bullmqSignal`
// fires or cancelRunningJob(key) is called. If the job fails because it was
// aborted, the error becomes an UnrecoverableError so BullMQ doesn't retry it.
export const runCancellable = async <T>(
  key: string | undefined,
  fn: () => Promise<T>,
  bullmqSignal?: AbortSignal
): Promise<T> => {
  const controller = new AbortController()
  const onBullmqAbort = () => controller.abort(bullmqSignal?.reason)
  if (bullmqSignal?.aborted) onBullmqAbort()
  bullmqSignal?.addEventListener('abort', onBullmqAbort, { once: true })

  if (key) {
    const set = running.get(key) ?? new Set()
    set.add(controller)
    running.set(key, set)
  }

  try {
    return await context.run(controller.signal, fn)
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason ?? 'cancelled')
      throw new UnrecoverableError(`Job cancelled: ${reason}`)
    }
    throw error
  } finally {
    bullmqSignal?.removeEventListener('abort', onBullmqAbort)
    if (key) {
      const set = running.get(key)
      set?.delete(controller)
      if (set?.size === 0) running.delete(key)
    }
  }
}

// Aborts every running job registered under `key`. Returns how many were
// aborted (0 if this worker isn't running that job).
export const cancelRunningJob = (key: string, reason: string): number => {
  const set = running.get(key)
  if (!set) return 0
  for (const controller of set) controller.abort(reason)
  logger.info(`Cancelled ${set.size} running job(s) for ${key}: ${reason}`)
  return set.size
}
