import { describe, it, expect, vi } from 'vitest'
import { createSseParser } from '../sse'

const parse = (...chunks: string[]) => {
  const onEvent = vi.fn()
  const parser = createSseParser(onEvent)
  chunks.forEach((c) => parser.push(c))
  return onEvent.mock.calls.map(([e]) => e)
}

describe('createSseParser', () => {
  it('parses a named event', () => {
    expect(parse('event: job\ndata: {"jobId":"j1"}\n\n')).toEqual([
      { event: 'job', data: '{"jobId":"j1"}' }
    ])
  })

  it('defaults the event name to "message"', () => {
    expect(parse('data: hi\n\n')).toEqual([{ event: 'message', data: 'hi' }])
  })

  it('reassembles events split across chunks', () => {
    expect(parse('event: jo', 'b\ndata: {"a"', ':1}\n', '\n')).toEqual([
      { event: 'job', data: '{"a":1}' }
    ])
  })

  it('handles several events in one chunk', () => {
    expect(
      parse('event: job\ndata: 1\n\nevent: job\ndata: 2\n\n').map((e) => e.data)
    ).toEqual(['1', '2'])
  })

  it('ignores comments such as heartbeats', () => {
    expect(parse(': connected\n\n: ping\n\nevent: job\ndata: 1\n\n')).toEqual([
      { event: 'job', data: '1' }
    ])
  })

  it('joins multi-line data with newlines', () => {
    expect(parse('data: a\ndata: b\n\n')).toEqual([
      { event: 'message', data: 'a\nb' }
    ])
  })

  it('accepts CRLF line endings', () => {
    expect(parse('event: job\r\ndata: 1\r\n\r\n')).toEqual([
      { event: 'job', data: '1' }
    ])
  })

  it('waits for the blank line before dispatching', () => {
    expect(parse('event: job\ndata: 1\n')).toEqual([])
  })
})
