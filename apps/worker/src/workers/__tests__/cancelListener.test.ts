import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Redis } from 'ioredis'
import { JOB_CANCEL_CHANNEL } from '@bilbomd/bilbomd-types'

const { cancelRunningJobMock } = vi.hoisted(() => ({
  cancelRunningJobMock: vi.fn()
}))

vi.mock('../../helpers/jobCancellation.js', () => ({
  cancelRunningJob: cancelRunningJobMock
}))

vi.mock('../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { handleCancelMessage, startCancelListener } from '../cancelListener.js'
import { logger } from '../../helpers/loggers.js'

beforeEach(() => {
  vi.clearAllMocks()
  cancelRunningJobMock.mockReturnValue(1)
})

describe('handleCancelMessage', () => {
  it('cancels the job named in the message', () => {
    handleCancelMessage(
      JSON.stringify({ jobid: 'abc123', reason: 'job deleted by user' })
    )
    expect(cancelRunningJobMock).toHaveBeenCalledWith(
      'abc123',
      'job deleted by user'
    )
  })

  it('defaults the reason', () => {
    handleCancelMessage(JSON.stringify({ jobid: 'abc123' }))
    expect(cancelRunningJobMock).toHaveBeenCalledWith('abc123', 'cancelled')
  })

  it.each(['not json', '{}', JSON.stringify({ jobid: 42 })])(
    'ignores malformed message %s',
    (raw) => {
      handleCancelMessage(raw)
      expect(cancelRunningJobMock).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    }
  )
})

describe('startCancelListener', () => {
  const makeSubscriber = () => {
    const sub = new EventEmitter() as EventEmitter & {
      subscribe: ReturnType<typeof vi.fn>
      unsubscribe: ReturnType<typeof vi.fn>
      quit: ReturnType<typeof vi.fn>
    }
    sub.subscribe = vi.fn().mockResolvedValue(1)
    sub.unsubscribe = vi.fn().mockResolvedValue(0)
    sub.quit = vi.fn().mockResolvedValue('OK')
    return sub
  }

  it('subscribes to the cancel channel and handles its messages only', async () => {
    const sub = makeSubscriber()
    await startCancelListener(sub as unknown as Redis)

    expect(sub.subscribe).toHaveBeenCalledWith(JOB_CANCEL_CHANNEL)
    sub.emit('message', 'some-other-channel', JSON.stringify({ jobid: 'x' }))
    expect(cancelRunningJobMock).not.toHaveBeenCalled()

    sub.emit(
      'message',
      JOB_CANCEL_CHANNEL,
      JSON.stringify({ jobid: 'x', reason: 'r' })
    )
    expect(cancelRunningJobMock).toHaveBeenCalledWith('x', 'r')
  })

  it('returns a function that unsubscribes and closes the connection', async () => {
    const sub = makeSubscriber()
    const stop = await startCancelListener(sub as unknown as Redis)

    await stop()

    expect(sub.unsubscribe).toHaveBeenCalledWith(JOB_CANCEL_CHANNEL)
    expect(sub.quit).toHaveBeenCalled()
  })
})
