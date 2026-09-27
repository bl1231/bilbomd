// Caps how many long-lived connections (e.g. event streams) one key may hold
// open at once. express-rate-limit counts requests over time, which doesn't
// fit connections that stay open for hours. In-memory, so per backend
// process.
export const createConnectionLimiter = (max: number) => {
  const open = new Map<string, number>()
  return {
    // Takes a slot for key; false when it already holds max
    tryAcquire: (key: string): boolean => {
      const count = open.get(key) ?? 0
      if (count >= max) return false
      open.set(key, count + 1)
      return true
    },
    release: (key: string): void => {
      const count = (open.get(key) ?? 0) - 1
      if (count > 0) open.set(key, count)
      else open.delete(key)
    },
    openCount: (key: string): number => open.get(key) ?? 0
  }
}

export type ConnectionLimiter = ReturnType<typeof createConnectionLimiter>
