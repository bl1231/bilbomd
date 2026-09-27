import { describe, it, expect } from 'vitest'
import { UnrecoverableError } from 'bullmq'
import {
  runCancellable,
  cancelRunningJob,
  currentAbortSignal
} from '../jobCancellation.js'
import { runProcess, spawnProcess } from '../runProcess.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runCancellable', () => {
  it('exposes an AbortSignal only inside the job context', async () => {
    expect(currentAbortSignal()).toBeUndefined()

    const inside = await runCancellable('job-1', async () => {
      await sleep(1)
      return currentAbortSignal()
    })

    expect(inside).toBeInstanceOf(AbortSignal)
    expect(inside?.aborted).toBe(false)
    expect(currentAbortSignal()).toBeUndefined()
  })

  it('keeps concurrent jobs in separate contexts', async () => {
    const seen = await Promise.all(
      ['a', 'b'].map((key) =>
        runCancellable(key, async () => {
          await sleep(5)
          return currentAbortSignal()
        })
      )
    )
    expect(seen[0]).not.toBe(seen[1])
  })

  it('aborts the context when the job is cancelled by id', async () => {
    const p = runCancellable('job-2', async () => {
      const signal = currentAbortSignal()!
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true })
      )
      throw new Error('stopped')
    })
    await sleep(1)

    expect(cancelRunningJob('job-2', 'deleted')).toBe(1)
    await expect(p).rejects.toThrow('Job cancelled: deleted')
  })

  it('turns failures after cancellation into an UnrecoverableError', async () => {
    const p = runCancellable('job-3', async () => {
      await sleep(20)
      throw new Error('some downstream failure')
    })
    cancelRunningJob('job-3', 'deleted')

    await expect(p).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('passes ordinary failures through unchanged', async () => {
    const err = new Error('CHARMM exited with code 1')
    await expect(
      runCancellable('job-4', async () => {
        throw err
      })
    ).rejects.toBe(err)
  })

  it('follows the BullMQ processor signal', async () => {
    const bullmq = new AbortController()
    const p = runCancellable(
      'job-5',
      async () => {
        await sleep(20)
        if (currentAbortSignal()?.aborted) throw new Error('aborted')
      },
      bullmq.signal
    )
    bullmq.abort('worker closing')

    await expect(p).rejects.toThrow('Job cancelled: worker closing')
  })

  it('starts aborted if the BullMQ signal already fired', async () => {
    const bullmq = new AbortController()
    bullmq.abort('gone')

    const aborted = await runCancellable(
      'job-6',
      async () => currentAbortSignal()?.aborted,
      bullmq.signal
    ).catch(() => 'threw')

    expect(aborted).toBe(true)
  })

  it('cancels every run registered under the same id', async () => {
    const run = () =>
      runCancellable('job-7', async () => {
        await sleep(20)
        if (currentAbortSignal()?.aborted) throw new Error('aborted')
      })
    const runs = [run(), run()]
    await sleep(1)

    expect(cancelRunningJob('job-7', 'deleted')).toBe(2)
    for (const p of runs) await expect(p).rejects.toThrow('Job cancelled')
  })

  it('forgets jobs once they finish', async () => {
    await runCancellable('job-8', async () => undefined)
    expect(cancelRunningJob('job-8', 'deleted')).toBe(0)
  })

  it('runs without registering when there is no id', async () => {
    await expect(runCancellable(undefined, async () => 42)).resolves.toBe(42)
  })
})

describe('cancellation reaching real processes', () => {
  const node = process.execPath

  it('kills a running process when its job is cancelled', async () => {
    const started = Date.now()
    const p = runCancellable('job-proc', () =>
      runProcess({
        label: 'long step',
        cmd: node,
        args: ['-e', 'setTimeout(() => {}, 60_000)']
      })
    )
    setTimeout(() => cancelRunningJob('job-proc', 'deleted'), 100)

    await expect(p).rejects.toThrow('Job cancelled: deleted')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('refuses to start new processes after the job is cancelled', async () => {
    const results = await runCancellable('job-after', async () => {
      cancelRunningJob('job-after', 'deleted')
      return spawnProcess({
        label: 'next step',
        cmd: node,
        args: ['-e', 'console.log("ran")']
      })
    }).catch((e: unknown) => e)

    // spawnProcess itself resolves with aborted: true without spawning; the
    // job as a whole resolves because nothing threw
    expect(results).toMatchObject({ aborted: true, code: null })
  })
})
