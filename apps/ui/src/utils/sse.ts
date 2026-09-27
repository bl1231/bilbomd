// Minimal Server-Sent Events parser for streams read with fetch(), which
// (unlike EventSource) can send an Authorization header. Feed it decoded
// text as it arrives; it calls onEvent for each complete event. Comment
// lines (heartbeats) and fields other than event/data are ignored.
export interface SseEvent {
  event: string
  data: string
}

export const createSseParser = (onEvent: (event: SseEvent) => void) => {
  let buffer = ''

  const dispatchBlock = (block: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length > 0) onEvent({ event, data: data.join('\n') })
  }

  return {
    push: (text: string) => {
      buffer += text.replace(/\r\n?/g, '\n')
      let end = buffer.indexOf('\n\n')
      while (end !== -1) {
        dispatchBlock(buffer.slice(0, end))
        buffer = buffer.slice(end + 2)
        end = buffer.indexOf('\n\n')
      }
    }
  }
}
