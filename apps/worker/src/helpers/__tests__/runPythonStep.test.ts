import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'

import { runPythonStep } from '../runPythonStep.js'
import { EventEmitter } from 'events'
import { spawn } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

describe('runPythonStep', () => {
  let mockChild
  let stdoutEmitter
  let stderrEmitter

  beforeEach(() => {
    stdoutEmitter = new EventEmitter()
    stderrEmitter = new EventEmitter()
    // mimic Node streams: add setEncoding no-ops
    stdoutEmitter.setEncoding = vi.fn()
    stderrEmitter.setEncoding = vi.fn()
    stdoutEmitter.resume = vi.fn()
    stdoutEmitter.pause = vi.fn()
    stderrEmitter.resume = vi.fn()
    stderrEmitter.pause = vi.fn()
    mockChild = new EventEmitter()
    mockChild.stdout = stdoutEmitter
    mockChild.stderr = stderrEmitter
    mockChild.kill = vi.fn()
    // make our mocked spawn return the fake child process
    ;(spawn as unknown as MockInstance).mockReturnValue(mockChild)
  })

  it('spawns the correct process with args', async () => {
    // Arrange
    const script = 'myscript.py'
    const config = 'config.yaml'
    // Act
    setTimeout(() => {
      stdoutEmitter.emit('end')
      stderrEmitter.emit('end')
      mockChild.emit('close', 0, null)
    }, 10)
    await runPythonStep(script, config, { pythonBin: 'python3', cwd: '/tmp', env: { FOO: 'bar' } })
    // Assert
    expect(spawn).toHaveBeenCalledWith(
      'python3',
      [script, config],
      expect.objectContaining({ cwd: '/tmp', env: expect.objectContaining({ FOO: 'bar' }) })
    )
  })

  it('calls onStdoutLine and onStderrLine for each line', async () => {
    const onStdoutLine = vi.fn()
    const onStderrLine = vi.fn()
    setTimeout(() => {
      stdoutEmitter.emit('data', 'line1\nline2\nleftover')
      stderrEmitter.emit('data', 'err1\n')
      stdoutEmitter.emit('end')
      stderrEmitter.emit('end')
      mockChild.emit('close', 0, null)
    }, 10)
    await runPythonStep('a.py', 'b.yaml', { onStdoutLine, onStderrLine })
    expect(onStdoutLine).toHaveBeenCalledWith('line1')
    expect(onStdoutLine).toHaveBeenCalledWith('line2')
    expect(onStdoutLine).toHaveBeenCalledWith('leftover')
    expect(onStderrLine).toHaveBeenCalledWith('err1')
  })

  it('kills the process on timeout', async () => {
    setTimeout(() => mockChild.emit('close', 1, 'SIGTERM'), 50)
    await runPythonStep('a.py', 'b.yaml', { timeoutMs: 10 })
    expect(mockChild.kill).toHaveBeenCalled()
  })

  it('returns the correct code and signal', async () => {
    setTimeout(() => mockChild.emit('close', 42, 'SIGUSR1'), 10)
    const result = await runPythonStep('a.py', 'b.yaml')
    expect(result).toEqual({ code: 42, signal: 'SIGUSR1' })
  })
})
