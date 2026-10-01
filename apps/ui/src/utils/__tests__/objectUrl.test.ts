import { describe, it, expect, vi, afterEach } from 'vitest'
import { revokeObjectUrlOnRemove } from '../objectUrl'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('revokeObjectUrlOnRemove', () => {
  it('revokes the URL once the cache entry is removed', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    let remove = () => {}
    const removed = new Promise<void>((resolve) => (remove = resolve))

    const done = revokeObjectUrlOnRemove(undefined, {
      cacheDataLoaded: Promise.resolve({ data: 'blob:x' }),
      cacheEntryRemoved: removed
    })
    await Promise.resolve()
    expect(revoke).not.toHaveBeenCalled()

    remove()
    await done
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:x')
  })

  it('does nothing when the entry goes away before loading', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await revokeObjectUrlOnRemove(undefined, {
      cacheDataLoaded: Promise.reject(new Error('removed')),
      cacheEntryRemoved: Promise.resolve()
    })
    expect(revoke).not.toHaveBeenCalled()
  })
})
