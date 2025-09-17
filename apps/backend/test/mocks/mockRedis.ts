import { vi } from 'vitest'

class MockRedis {
  constructor(_options?: any) {
    // Do nothing
  }
  get(_key: string) {
    return Promise.resolve(null)
  }
  set(_key: string, _value: string, ..._args: any[]) {
    return Promise.resolve('OK')
  }
  del(_key: string) {
    return Promise.resolve(1)
  }
  on(_event: string, _handler: () => void) {
    // Do nothing
  }
  quit() {
    return Promise.resolve('OK')
  }
}

vi.mock('ioredis', () => {
  return {
    default: MockRedis,
    Redis: MockRedis // 👈 export Redis as named export too!
  }
})
